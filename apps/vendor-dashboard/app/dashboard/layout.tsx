'use client';

import { Sidebar } from '@/components/dashboard/sidebar/Sidebar'
import { Navbar } from '@/components/dashboard/navbar/Navbar'
import { DashboardFooter } from '@/components/dashboard/layout'
import { useSidebarStore } from '@/lib/state/sidebar-store'
import { cn } from '@repo/ui/lib/utils'
import { ThemeProviders } from "@repo/ui/components/theme-provider"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isCollapsed } = useSidebarStore()

  return (
    <ThemeProviders>
      <div className="min-h-screen bg-background">
        <Sidebar />

        <div
          className={cn(
            'min-h-screen transition-all duration-200',
            isCollapsed ? 'lg:ml-20' : 'lg:ml-64'
          )}
        >
          <Navbar />
          
          {/* Consistent main wrapper for all pages */}
          <main className="p-4 sm:p-6 space-y-6 max-w-480 mx-auto">
            {children}
          </main>
          
          <DashboardFooter />
        </div>
      </div>
    </ThemeProviders>
  );
}