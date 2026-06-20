import type { Metadata } from "next"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { AdminSessionProvider } from "@/components/dashboard/layout/AdminSessionContext"
import { Sidebar } from "@/components/dashboard/sidebar/Sidebar"
import { Navbar } from "@/components/dashboard/navbar/Navbar"
import { Footer } from "@/components/dashboard/layout/Footer"
import type { AdminSessionData, ApiSuccess } from "@repo/types/admin-app"
import { SidebarProvider } from "@/providers/sidebar-provider"

export const metadata: Metadata = {
  title: {
    template: "%s | DailyBread Ops",
    default: "Dashboard | DailyBread Ops",
  },
  description: "DailyBread operations and administration dashboard",
}

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
      next: { revalidate: 300 },
    }
  )

  if (!sessionRes.ok) redirect("/sign-in")

  const { data: session }: ApiSuccess<AdminSessionData> = await sessionRes.json()

  return (
      <AdminSessionProvider session={session}>
        <SidebarProvider>
          <div className="relative min-h-screen bg-background">
            <Sidebar session={session} />

            <div
              className="flex min-h-screen flex-col transition-[padding-left] duration-[380ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{ paddingLeft: "var(--_sidebar-offset, 0px)" }}
            >
              <Navbar />

              <main className="flex-1 min-w-0 overflow-x-hidden">
                <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10 xl:px-10">
                  {children}
                </div>
              </main>

              <Footer />
            </div>
          </div>
        </SidebarProvider>
      </AdminSessionProvider>
  )
}