import { PageGrid } from "@/components/dashboard/layout/DashboardShell"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { ComingSoon } from "@/components/dashboard/layout/ComingSoon"
import { requireSetupAccess } from "@/lib/vendor/guards"

export const metadata = { title: "Notifications" }

/*
 * Where the navbar's bell leads. There is no notification system for vendors
 * yet, so this says so plainly — no sample notifications (the old dropdown
 * showed invented orders and payouts, principle 11). Open to any vendor who
 * can reach the dashboard, not only live ones: the bell is in every page's
 * navbar.
 */
export default async function NotificationsPage() {
  await requireSetupAccess()

  return (
    <PageGrid>
      <PageHeader title="Notifications" description="Updates about your orders, menu and account." />
      <ComingSoon
        feature="Notifications"
        note="Notifications aren't available yet. Review decisions about your menu still appear on the meal or location they concern."
      />
    </PageGrid>
  )
}
