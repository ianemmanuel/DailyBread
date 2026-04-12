import { auth }   from "@clerk/nextjs/server"
import type { ApiSuccess, ApiErrorResponse } from "@repo/types/admin-app"

/**
 * adminFetch — typed server-side fetch wrapper.
 *
 * Automatically attaches the Clerk Bearer token.
 * Throws on non-OK responses with the backend's error shape.
 *
 * Usage (in server components / route handlers):
 *   const users = await adminFetch<ListResult>("/admin/v1/users")
 *   const user  = await adminFetch<AdminUser>("/admin/v1/users/123")
 */
export async function adminFetch<T>(
  path   : string,
  options: RequestInit & { next?: NextFetchRequestConfig } = {},
): Promise<T> {
  const { getToken } = await auth()
  const token        = await getToken()

  const base = process.env.BACKEND_API_URL
  if (!base) throw new Error("BACKEND_API_URL is not set")

  const url = `${base}${path}`

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization : `Bearer ${token}`,
      ...options.headers,
    },
    next: options.next,
  })

  const body = await res.json() as ApiSuccess<T> | ApiErrorResponse

  if (body.status === "error") {
    throw new ApiCallError(body.message, body.code, res.status)
  }

  return body.data
}

export class ApiCallError extends Error {
  constructor(
    message        : string,
    public code    : string,
    public status  : number,
  ) {
    super(message)
    this.name = "ApiCallError"
  }
}

// Type augmentation for Next.js fetch options
interface NextFetchRequestConfig {
  revalidate?: number | false
  tags?      : string[]
}