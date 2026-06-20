import { VendorMetrics } from "@/types/vendor.types"

interface Props {
  metrics: VendorMetrics | null
}

export default function ApplicationPipeline({
  metrics,
}: Props) {
  if (!metrics) return null
  const items = [
    ["Draft", metrics.draftApplications],
    ["Submitted", metrics.submittedApplications],
    ["Under Review", metrics.underReviewApplications],
    ["Approved", metrics.approvedApplications],
    ["Rejected", metrics.rejectedApplications],
  ]

  return (
    <div
      className="rounded-xl border p-5"
      style={{
        backgroundColor: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
        <h3 className="mb-4 font-medium">
            Application Pipeline
        </h3>

        <div className="space-y-3">
            {items.map(([label, value]) => (
                <div
                    key={label}
                    className="flex items-center justify-between"
                >
                    <span
                        className="text-sm"
                        style={{
                            color: "var(--muted-foreground)",
                        }}
                    >
                        {label}
                    </span>

                    <span className="font-semibold">
                        {value}
                    </span>
                </div>
            ))}
        </div>
    </div>
  )
}