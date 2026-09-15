import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageGrid } from "@/components/dashboard/layout/DashboardShell"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { ComingSoon } from "@/components/dashboard/layout/ComingSoon"
import { requireSetupAccess } from "@/lib/vendor/guards"

export const metadata = { title: "Outlet revenue" }

/*
 * Financial performance across every outlet.
 *
 * Deliberately a placeholder rather than a chart: there is no Order or Payment
 * model in the schema yet, so every figure on this page would be invented.
 * Mock revenue is acceptable in an internal admin tool; showing a vendor
 * fabricated earnings for their own business is not. The page and its route
 * exist so the real report drops straight in once orders are captured.
 */
export default async function OutletRevenuePage() {
  await requireSetupAccess()

  return (
    <PageGrid>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-xl" asChild>
          <Link href="/outlets"><ChevronLeft className="size-4" /></Link>
        </Button>
        <PageHeader
          title="Outlet revenue"
          description="Financial performance across all of your outlets."
        />
      </div>

      <ComingSoon
        feature="Revenue reporting"
        note="Earnings, payouts and per-outlet performance will appear here once your outlets start taking orders on the platform."
      />
    </PageGrid>
  )
}
