import { PageHeader, QuickActions } from '@/components/dashboard/layout'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { MealPlanPerformance, RevenueChart } from '@/components/dashboard/charts'
import { RecentOrders } from '@/components/dashboard/tables/RecentOrders'
import { TopMeals } from '@/components/dashboard/tables'

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Welcome back! Here's what's happening with your platform today."
      />

      <QuickActions />
      
      <StatsCards />

      <RevenueChart />
      
      <RecentOrders />

      <div className="grid gap-6 lg:grid-cols-2">
        <TopMeals />
        <MealPlanPerformance />
      </div>
    </>
  );
}