import { LatestVendorApplication, VendorMetrics } from "@/types/vendor.types"
import VendorOverview from "./VendorOverview"
import VendorTypeChart from "./VendorTypeChart"
import LatestApplications from "./LatestApplications"

interface Props {
  vendormetrics: VendorMetrics | null
  applications: LatestVendorApplication[]
}

export default function VendorEcosystemSection({
  vendormetrics,
  applications,
}: Props) {
   console.log(JSON.stringify(applications, null, 2))
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <VendorOverview metrics={vendormetrics} />
        <LatestApplications applications={applications} />
      </div>
      <VendorTypeChart
        metrics={vendormetrics?.vendorsByType ?? []}
      />
    </div>
  )
}