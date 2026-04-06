import type { Metadata } from "next"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { ThemeProvider } from "@/components/dashboard/layout/ThemeProvider"
import { AdminSessionProvider } from "@/components/dashboard/layout/AdminSessionContext"
import { Sidebar } from "@/components/dashboard/sidebar/Sidebar"
import { Navbar } from "@/components/dashboard/navbar/Navbar"
import { Footer } from "@/components/dashboard/layout/Footer"
import type { AdminSessionData } from "@repo/types/admin-app"

export const metadata: Metadata = { title: "Dashboard" }

/**
 * Dashboard layout — server component.
 *
 * 1. Verifies Clerk session (defence-in-depth; middleware already guards)
 * 2. Fetches admin session data from /api/admin/v1/auth/session
 *    - Forwarded with the Clerk token so the backend can authenticate
 *    - Cached per-request via Next.js fetch deduplication
 *    - No useEffect, no client round-trip
 * 3. Provides session via AdminSessionProvider to all client components
 * 4. Wraps in ThemeProvider (dark mode toggle lives here)
 *
 * Layout:
 *   ┌──────────┬─────────────────────────┐
 *   │          │  Navbar (sticky)        │
 *   │ Sidebar  ├─────────────────────────┤
 *   │ (fixed)  │  {children}             │
 *   │          ├─────────────────────────┤
 *   │          │  Footer                 │
 *   └──────────┴─────────────────────────┘
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  const { getToken,  isAuthenticated } = await auth()
  if (!isAuthenticated) redirect("/sign-in")

  // ── Fetch session data server-side ──────────────────────────────────────────
  // We forward the Clerk JWT so the backend can authenticate the request.
  // next: { revalidate: 300 } — re-fetch every 5 min on server.
  // The frontend also re-fetches on hard navigation (new layout render).
  // For changes like role reassignment, the user re-logs in or navigates away.
  const token = await getToken()

  const sessionRes = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/auth/session`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        // Forward the incoming request headers for edge cases
        ...(await headers()).get("x-forwarded-for")
          ? { "x-forwarded-for": (await headers()).get("x-forwarded-for")! }
          : {},
      },
      next: { revalidate: 300 },  // 5-minute server cache
    },
  )

  if (!sessionRes.ok) {
    // Backend rejected the token — redirect to sign-in
    // This handles deactivated/suspended users whose Clerk token is still valid
    redirect("/sign-in")
  }

  const { data: session }: { data: AdminSessionData } = await sessionRes.json()

  return (
    <ThemeProvider>
      <AdminSessionProvider session={session}>
        <div className="flex min-h-screen bg-background">

          {/* Desktop sidebar — fixed, always visible */}
          <Sidebar session={session} />

          {/* Main column */}
          <div className="flex flex-1 flex-col lg:pl-64">
            <Navbar session={session} />

            <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
              {children}
            </main>

            <Footer />
          </div>

        </div>
      </AdminSessionProvider>
    </ThemeProvider>
  )
}