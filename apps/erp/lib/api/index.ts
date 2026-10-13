import { auth } from "@clerk/nextjs/server"

const BACKEND_API_URL = process.env.BACKEND_API_URL

/**
 * Thrown for any non-2xx backend response. `status` mirrors the HTTP
 * status code so callers can branch on it (e.g. `err.status === 404`).
 */
export class ApiCallError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = "ApiCallError"
    this.status = status
    this.code = code
  }
}

/**
 * Server-only fetch wrapper for the Express backend. Attaches the current
 * Clerk session token and unwraps the `{ status, message, data }` envelope
 * every admin endpoint responds with — callers get `data` directly.
 *
 * Never import this from a Client Component: it reads the Clerk session
 * via `auth()`, which only resolves on the server.
 */
export async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { getToken } = await auth()
  const token = await getToken()

  const res = await fetch(`${BACKEND_API_URL}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  let body: { message?: string; code?: string; data?: T } | null = null
  try {
    body = await res.json()
  } catch {
    // No JSON body (e.g. 204) — fall through with body === null
  }

  if (!res.ok) {
    throw new ApiCallError(
      res.status,
      body?.message ?? `Request failed with status ${res.status}`,
      body?.code,
    )
  }

  return (body?.data ?? body) as T
}
