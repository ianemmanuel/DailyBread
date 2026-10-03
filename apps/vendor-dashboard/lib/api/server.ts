/*
 * Server-only backend client. Never import this from a "use client"
 * component — it reads the Clerk secret-backed session token and the
 * (non-NEXT_PUBLIC, therefore already server-only) BACKEND_API_URL env
 * var. Used directly by Server Components for reads, and by the
 * app/api/** Route Handlers that proxy client-initiated writes — the
 * Clerk token never reaches client JS either way, mirroring the
 * pattern already established in apps/admin-dashboard.
 */
import { auth } from "@clerk/nextjs/server"

const BACKEND_API_URL = process.env.BACKEND_API_URL

interface ApiEnvelope<T> {
  status: "success" | "error"
  message?: string
  data?: T
  code?: string
  errors?: { field?: string; message: string }[]
}

export class BackendApiError extends Error {
  status: number
  code: string
  errors?: { field?: string; message: string }[]

  constructor(status: number, code: string, message: string, errors?: { field?: string; message: string }[]) {
    super(message)
    this.name = "BackendApiError"
    this.status = status
    this.code = code
    this.errors = errors
  }
}

/*
 * Every vendor-dashboard call to the backend goes through this one
 * function — Server Component reads and Route Handler writes alike.
 * Default is cache: "no-store", since most of what this app reads
 * (session/application state) changes from admin actions and must
 * never be served stale. Callers reading genuinely slow-changing,
 * admin-curated reference data (countries, vendor types, document
 * requirements) can opt in with `revalidate` to skip the round trip
 * for that long instead — the backend remains the source of truth
 * either way, this only controls how long Next.js may reuse a response.
 */
export async function backendFetch<T>(
  path: string,
  init?: RequestInit & { revalidate?: number; tags?: string[] },
): Promise<T> {
  const { getToken } = await auth()
  const token = await getToken()

  if (!token) {
    throw new BackendApiError(401, "UNAUTHENTICATED", "Not signed in")
  }

  const { revalidate, tags, ...rest } = init ?? {}

  const res = await fetch(`${BACKEND_API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...rest.headers,
    },
    // revalidate and tags travel together: a caller that opts into ISR
    // usually also wants a tag to invalidate it precisely on mutation.
    // Building one `next` object avoids the earlier bug where passing
    // both silently dropped the tags.
    ...(revalidate !== undefined || tags
      ? { next: { ...(revalidate !== undefined ? { revalidate } : {}), ...(tags ? { tags } : {}) } }
      : { cache: "no-store" }),
  })

  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null

  if (res.status === 401) {
    /*
     * Diagnostic only. The backend answers every refused token with a bare
     * "Unauthorized", so without this the dev log cannot say whether the token
     * we SENT was already past its expiry (Clerk's middleware accepts a few
     * seconds of skew; the backend's verifier may not). Logs the error code and
     * the token's age relative to `exp` — never the token or any identity claim.
     */
    console.warn(
      `[backendFetch] 401 ${body?.code ?? "UNKNOWN"} on ${rest.method ?? "GET"} ${path.split("?")[0]}` +
        describeTokenExpiry(token),
    )
  }

  if (!res.ok || body?.status === "error") {
    throw new BackendApiError(
      res.status,
      body?.code ?? "UNKNOWN_ERROR",
      body?.message ?? "Request failed",
      body?.errors,
    )
  }

  return body?.data as T
}

/** " (token exp 2.4s ago)" / " (token exp in 41.0s)" — read from the payload's
 *  `exp` only, by this server's clock. Empty if it cannot be read. */
function describeTokenExpiry(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: unknown }
    if (typeof payload.exp !== "number") return ""
    const delta = (Date.now() - payload.exp * 1000) / 1000
    return delta >= 0 ? ` (token exp ${delta.toFixed(1)}s ago)` : ` (token exp in ${(-delta).toFixed(1)}s)`
  } catch {
    return ""
  }
}
