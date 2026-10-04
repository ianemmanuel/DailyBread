import { cookies } from 'next/headers'
import { Sidebar } from '@/components/dashboard/sidebar/Sidebar'
import { SidebarInset, SidebarStateProvider } from '@/components/dashboard/sidebar/SidebarState'
import { SIDEBAR_COOKIE } from '@/components/dashboard/sidebar/sidebar-cookie'
import { Navbar } from '@/components/dashboard/navbar/Navbar'
import { DashboardFooter } from '@/components/dashboard/layout'
import { NotLiveBanner } from '@/components/dashboard/layout/NotLiveBanner'
import { VendorNavProvider } from '@/components/dashboard/VendorNavContext'
import { getVendorSession, isSellingReady } from '@/lib/vendor/guards'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Resolved once here (React-cached, shared with the per-route guards) so the
  // client sidebar can reflect the setup / operational split. Route-level
  // access is enforced by the page/group guards, not by this layout.
  const session = await getVendorSession()
  // Read here so the server renders the tree the client hydrates — a
  // collapsed rail must not flash expanded, and must not shift Radix ids
  // (bug class #12). The dashboard is already per-request (the session).
  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === 'true'

  return (
    <VendorNavProvider
      sellingReady={isSellingReady(session)}
      identity={{
        businessName: session?.vendorAccount?.legalBusinessName ?? null,
        email       : session?.vendorUser.email ?? null,
      }}
    >
      <SidebarStateProvider initialCollapsed={sidebarCollapsed}>
        <div className="min-h-screen bg-background">
          <Sidebar />

          <SidebarInset>
            <Navbar />

            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
              {/* A vendor may work in the authoring area (menu) before going
                  live, so the outstanding-setup reminder belongs here, above
                  every dashboard page — not only on /setup. */}
              {session?.goLiveStatus && <NotLiveBanner status={session.goLiveStatus} />}
              {children}
            </main>

            <DashboardFooter />
          </SidebarInset>
        </div>
      </SidebarStateProvider>
    </VendorNavProvider>
  )
}
