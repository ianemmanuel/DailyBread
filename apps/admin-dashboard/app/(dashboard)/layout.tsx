import type { Metadata } from "next"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { ThemeProvider } from "@/components/dashboard/layout/ThemeProvider"
import { AdminSessionProvider } from "@/components/dashboard/layout/AdminSessionContext"
import { Sidebar } from "@/components/dashboard/sidebar/Sidebar"
import { Navbar } from "@/components/dashboard/navbar/Navbar"
import { Footer } from "@/components/dashboard/layout/Footer"
import type { AdminSessionData, ApiSuccess }   from "@repo/types/admin-app"

export const metadata: Metadata = { title: "Dashboard" }

/**
 * Dashboard layout — server component.
 *
 * Data flow:
 *   1. auth() → get Clerk token
 *   2. fetch /api/admin/v1/auth/session with Bearer token
 *      → cached with next: { revalidate: 300 }
 *      → Next.js deduplicates if overview page fetches the same URL
 *   3. Pass session as props to server components (Sidebar, Navbar)
 *   4. Wrap in AdminSessionProvider for client components
 *
 * If the backend rejects the token (deactivated, suspended) → redirect /sign-in
 * The backend is the authoritative gatekeeper — the layout just propagates the result.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()

  const sessionRes = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/auth/session`,
    {
      headers: { Authorization: `Bearer ${token}` },
      next   : { revalidate: 300 },
    },
  )

  if (!sessionRes.ok) redirect("/sign-in")

  const { data: session }: ApiSuccess<AdminSessionData> = await sessionRes.json()

  return (
    <ThemeProvider>
      <AdminSessionProvider session={session}>
        <div className="flex min-h-screen bg-background">

          {/* Fixed desktop sidebar */}
          <Sidebar session={session} />

          {/* Main column — offset by sidebar width on lg+ */}
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