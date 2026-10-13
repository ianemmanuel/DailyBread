import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import type { AdminSessionData, ApiSuccess } from "@repo/types/admin-app"

/**
 * Resolves the current admin's session from the backend — the
 * authoritative source for role/permissions/scope (Clerk only proves
 * *identity*, not admin standing).
 *
 * Redirects to /sign-in only when there's no Clerk session at all. If
 * Clerk auth succeeded but the backend rejects the admin (no AdminUser
 * row, not yet activated, suspended, deactivated), redirecting back to
 * /sign-in is a dead end — the user IS signed in with Clerk, so Clerk's
 * own post-sign-in redirect just bounces them straight back into the app,
 * producing an infinite /overview ↔ /sign-in loop with no explanation.
 * /unauthorized breaks that loop and explains what's actually wrong.
 *
 * Centralizes what was previously copy-pasted in the dashboard layout and
 * every vendors/* page. Next.js dedupes identical fetch() calls within one
 * render pass, so calling this from both a layout and its nested page
 * costs one network round-trip, not two.
 */
export async function getAdminSession(): Promise<AdminSessionData> {
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()

  const res = await fetch(`${process.env.BACKEND_API_URL}/admin/v1/auth/session`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 300 },
  })

  if (!res.ok) {
    let code    = "UNKNOWN_ERROR"
    let message = "We couldn't verify your admin access."
    try {
      const body = await res.json()
      code    = body?.code    ?? code
      message = body?.message ?? message
    } catch {
      // Non-JSON error body (e.g. backend unreachable) — keep the defaults.
    }
    redirect(`/unauthorized?${new URLSearchParams({ code, message }).toString()}`)
  }

  const { data: session }: ApiSuccess<AdminSessionData> = await res.json()
  return session
}
