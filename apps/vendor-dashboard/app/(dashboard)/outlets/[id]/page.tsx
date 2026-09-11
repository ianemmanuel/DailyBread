import { notFound } from "next/navigation"
import { PageGrid, SectionGrid } from "@/components/dashboard/layout/DashboardShell"
import { OutletDetailHeader } from "@/components/outlets/OutletDetailHeader"
import { OutletGoLivePanel } from "@/components/outlets/OutletGoLivePanel"
import { OutletFlagNotice } from "@/components/outlets/OutletFlagNotice"
import { OutletDetailHero } from "@/components/outlets/OutletDetailHero"
import { OutletHoursCard } from "@/components/outlets/OutletHoursCard"
import { OutletInspectionCard } from "@/components/outlets/OutletInspectionCard"
import { OutletEditSections } from "@/components/outlets/OutletEditSections"
import { getOutlet } from "@/lib/vendor/outlets"
import { requireSetupAccess } from "@/lib/vendor/guards"

/*
 * Ordered by what the vendor needs first: what's wrong (if anything), what
 * this outlet is, then what they can change. The flag notice moved up from the
 * very bottom — a warning nobody scrolls to is not a warning.
 */
export default async function OutletDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireSetupAccess()

  const { id } = await params
  const outlet = await getOutlet(id)
  if (!outlet) notFound()

  return (
    <PageGrid>
      <OutletDetailHeader outlet={outlet} />

      {outlet.reviewStatus === "FLAGGED" && <OutletFlagNotice reasons={outlet.flagReasons} />}
      {outlet.goLiveStatus && <OutletGoLivePanel status={outlet.goLiveStatus} />}

      <SectionGrid cols={3}>
        <div className="lg:col-span-2">
          <OutletDetailHero outlet={outlet} />
        </div>
        <OutletHoursCard outletId={outlet.id} existing={outlet.operatingHours} />
      </SectionGrid>

      <OutletInspectionCard outletId={outlet.id} readiness={outlet.mealPlanReadiness} />

      <OutletEditSections outlet={outlet} />
    </PageGrid>
  )
}
