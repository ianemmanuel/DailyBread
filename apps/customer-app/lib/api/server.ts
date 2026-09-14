import "server-only"
import { auth } from "@clerk/nextjs/server"

/*
 * Server-only backend client.
 *
 * ─── How this differs from the dashboards ────────────────────────────────────
 *
 * The vendor and admin apps' backendFetch THROWS when there is no Clerk token,
 * because every route in those apps requires an identity. This app is the
 * opposite: browsing, storefronts and cart pricing are all public, so the token
 * is attached only when one happens to exist and its absence is never an error.
 *
 * That mirrors the backend exactly — attachCustomerContext resolves an identity
 * when present and continues anonymously otherwise — so a signed-in visitor and
 * a signed-out one hit the same endpoints and the server decides what differs.
 *
 * The token never reaches client JS: Server Components call this directly for
 * reads, and client-initiated writes go through app/api/** route handlers that
 * call it on the server.
 */

const BACKEND_API_URL = process.env.BACKEND_API_URL

interface ApiEnvelope<T> {
  status  : "success" | "error"
  message?: string
  data?   : T
  code?   : string
  errors? : { field?: string; message: string }[]
}

export class BackendApiError extends Error {
  status : number
  code   : string
  errors?: { field?: string; message: string }[]

  constructor(status: number, code: string, message: string, errors?: { field?: string; message: string }[]) {
    super(message)
    this.name = "BackendApiError"
    this.status = status
    this.code = code
    this.errors = errors
  }
}

export interface FetchOptions extends RequestInit {
  /** Opt into ISR. Travels with `tags` in one `next` object — passing both
   *  separately is how the vendor app once silently dropped its tags. */
  revalidate?: number
  tags?      : string[]
  /** Skip the Clerk lookup entirely. For a genuinely shared, identical-for-
   *  everyone response that we also want to CACHE — a cached response must not
   *  depend on who asked for it. */
  anonymous? : boolean
}

export async function backendFetch<T>(path: string, init?: FetchOptions): Promise<T> {
  if (!BACKEND_API_URL) {
    throw new BackendApiError(500, "BACKEND_URL_MISSING", "BACKEND_API_URL is not configured.")
  }

  const { revalidate, tags, anonymous, ...rest } = init ?? {}

  /*
   * A missing token is normal here, not a failure. auth() is also wrapped:
   * outside a request scope (a build-time prerender, say) it throws, and a
   * public page must still render.
   */
  let token: string | null = null
  if (!anonymous) {
    try {
      token = await (await auth()).getToken()
    } catch {
      token = null
    }
  }

  const res = await fetch(`${BACKEND_API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
    /*
     * Anything carrying a token is per-user and must never be cached — Next
     * would key the entry on the URL and hand one visitor another's response.
     * Only explicitly anonymous reads may opt into ISR.
     */
    ...(revalidate !== undefined || tags
      ? { next: { ...(revalidate !== undefined ? { revalidate } : {}), ...(tags ? { tags } : {}) } }
      : { cache: "no-store" }),
  })

  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null

  if (!res.ok || body?.status === "error") {
    throw new BackendApiError(
      res.status,
      body?.code ?? "UNKNOWN_ERROR",
      body?.message ?? "Something went wrong.",
      body?.errors,
    )
  }

  return body?.data as T
}

/** True when the caller is signed in. Used to decide whether to offer the
 *  address book or the anonymous location picker — never to gate a read. */
export async function isSignedIn(): Promise<boolean> {
  try {
    return !!(await auth()).userId
  } catch {
    return false
  }
}
