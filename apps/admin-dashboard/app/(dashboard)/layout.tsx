import type { Metadata } from "next"
import { cookies } from "next/headers"
import { AdminSessionProvider } from "@/providers/admin-session-provider"
import { Sidebar } from "@/components/dashboard/sidebar/Sidebar"
import { Navbar } from "@/components/dashboard/navbar/Navbar"
import { Footer } from "@/components/dashboard/layout/Footer"
import { SIDEBAR_COOKIE, SidebarProvider } from "@/providers/sidebar-provider"
import { getAdminSession } from "@/lib/auth/session"

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
  const session = await getAdminSession()

  /* Read here so the server renders the SAME tree the client will hydrate.
   * The collapsed sidebar renders a Popover and a Tooltip per section, both of
   * which call Radix's useId, so a server/client disagreement shifts generated
   * ids across the whole page — see sidebar-provider.tsx. */
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "true"

  return (
      <AdminSessionProvider session={session}>
        <SidebarProvider initialCollapsed={collapsed}>
          {/* Seeds the layout offset before first paint, so a collapsed
              sidebar no longer flashes at full width. The media query is what
              keeps it desktop-only, and it cannot live in an inline style. */}
          <style>{`@media (min-width:1024px){:root{--_sidebar-offset:${
            collapsed ? "72px" : "240px"
          }}}`}</style>
          <div className="relative min-h-screen bg-background">
            <Sidebar/>

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