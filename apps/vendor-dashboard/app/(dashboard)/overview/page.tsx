import { PageHeader } from '@/components/dashboard/layout/PageHeader'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { QuickActions } from '@/components/dashboard/layout/QuickActions'
import { RevenueChart } from '@/components/dashboard/charts/Revenue'
import { MealPlanPerformance } from '@/components/dashboard/charts/MealPlanPerformance'
import { RecentOrders } from '@/components/dashboard/tables/RecentOrders'
import { TopMeals } from '@/components/dashboard/tables/TopMeals'
import {
  PageGrid,
  SectionGrid,
  TableShell,
  ChartShell,
} from '@/components/dashboard/layout/DashboardShell'

/*
  ADDING NEW PAGES?
  Use PageGrid, SectionGrid, TableShell, ChartShell from DashboardShell.
  Don't add padding — layout.tsx handles all padding.
  Don't add max-w — layout.tsx handles that too.
*/
export default function OverviewPage() {
  return (
    <PageGrid>

      <PageHeader
        title="Overview"
        description="Here's what's happening in your kitchen today."
      />

      {/* 4 KPI stats */}
      <StatsCards />

      {/* Revenue chart (2/3) + Meal plan donut (1/3) */}
      <SectionGrid cols={3}>
        <ChartShell className="lg:col-span-2">
          <RevenueChart />
        </ChartShell>
        <ChartShell>
          <MealPlanPerformance />
        </ChartShell>
      </SectionGrid>

      {/* Recent orders (2/3) + Quick actions (1/3) */}
      <SectionGrid cols={3}>
        <TableShell className="lg:col-span-2">
          <RecentOrders />
        </TableShell>
        <QuickActions />
      </SectionGrid>

      {/* Top meals — full width */}
      <TableShell>
        <TopMeals />
      </TableShell>

    </PageGrid>
  )
}