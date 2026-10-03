import { Sidebar } from '@/components/dashboard/sidebar/Sidebar'
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

  return (
    <VendorNavProvider
      sellingReady={isSellingReady(session)}
      identity={{
        businessName: session?.vendorAccount?.legalBusinessName ?? null,
        email       : session?.vendorUser.email ?? null,
      }}
    >
      <div className="min-h-screen bg-background">
        <Sidebar />

        <div className="flex min-h-screen flex-col overflow-x-hidden lg:ml-64">
          <Navbar />

          {/* IMPORTANT: padding-top offsets fixed navbar */}
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-20 pb-6 sm:px-6 sm:pt-24 sm:pb-8">
            {/* A vendor may work in the authoring area (menu) before going
                live, so the outstanding-setup reminder belongs here, above
                every dashboard page — not only on /setup. */}
            {session?.goLiveStatus && <NotLiveBanner status={session.goLiveStatus} />}
            {children}
          </main>

          <DashboardFooter />
        </div>
      </div>
    </VendorNavProvider>
  )
}
