import { Sidebar } from '@/components/dashboard/sidebar/Sidebar'
import { Navbar } from '@/components/dashboard/navbar/Navbar'
import { DashboardFooter } from '@/components/dashboard/layout'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />

      <div className="flex min-h-screen flex-col overflow-x-hidden lg:ml-64">
        <Navbar />

        {/* IMPORTANT: padding-top offsets fixed navbar */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-20 pb-6 sm:px-6 sm:pt-24 sm:pb-8">
          {children}
        </main>

        <DashboardFooter />
      </div>
    </div>
  )
}