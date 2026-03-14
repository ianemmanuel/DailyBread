import { Sidebar } from '@/components/dashboard/sidebar/Sidebar'
import { Navbar } from '@/components/dashboard/navbar/Navbar'
import { DashboardFooter } from '@/components/dashboard/layout'

/*
  RESPONSIVE STRATEGY — read this before editing.

  Mobile  (<lg): Sidebar hidden. Navbar shows burger → opens Sheet.
  Desktop (≥lg): Sidebar fixed w-64. Navbar has no burger.

  The `overflow-x-hidden` on the outer div prevents the Sheet slide-in
  animation from causing a horizontal scrollbar on mobile.

  The `<main>` here is the ONLY place that sets padding and max-width.
  Every page just renders its content — no padding needed on page files.
  New pages are automatically responsive. Do NOT add p-* or max-w-* on pages.
*/
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-h-screen flex-col overflow-x-hidden lg:ml-64">
        <Navbar />
        <main className="mx-auto min-w-0 w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
        <DashboardFooter />
      </div>
    </div>
  )
}