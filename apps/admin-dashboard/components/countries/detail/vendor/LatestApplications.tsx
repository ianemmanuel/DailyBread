import { LatestVendorApplication } from "@/types/vendor.types"
import { StatusBadge } from "./StatusBadge"

interface Props {
  applications: LatestVendorApplication[]
}

export default function LatestApplications({
  applications,
}: Props) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{
        backgroundColor: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      <h3 className="mb-4 font-medium">
        Latest Applications
      </h3>

      <div className="space-y-3">
        {applications.map((app) => (
          <div
            key={app.id}
            className="flex items-center justify-between"
          >
            <div>
              <p className="font-medium">
                {app.legalBusinessName}
              </p>

              <p
                className="text-xs"
                style={{
                  color: "var(--muted-foreground)",
                }}
              >
                {app.vendorType.name}
              </p>
            </div>

            <StatusBadge status={app.status} />
          </div>
        ))}
      </div>
    </div>
  )
}