import { VendorMetrics } from "@/types/vendor.types"

import {
  Building2,
  CheckCircle2,
  ShieldAlert,
  Ban,
} from "lucide-react"

interface Props {
  metrics: VendorMetrics | null
}

export default function VendorOverview({
  metrics,
}: Props) {
  if (!metrics) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{
        backgroundColor: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      <h3 className="font-medium">
        Vendor Ecosystem
      </h3>

      <p
        className="mt-2 text-sm"
        style={{
          color: "var(--muted-foreground)",
        }}
      >
        Vendor statistics are not available for this country yet.
      </p>
    </div>
  )
}

  return (
    <div
      className="rounded-lg border p-5"
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex items-center gap-2">
        <Building2
          className="h-4 w-4"
          style={{ color: "var(--primary)" }}
        />

        <span className="text-sm font-medium">
          Vendor Network
        </span>
      </div>

      <div className="mt-4">
        <p className="text-3xl font-semibold tabular-nums">
          {metrics.totalVendors.toLocaleString()}
        </p>

        <p
          className="mt-1 text-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          Total Vendors
        </p>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2
              className="h-4 w-4"
              style={{ color: "var(--success)" }}
            />
            <span>Active</span>
          </div>

          <span className="tabular-nums font-medium">
            {metrics.activeVendors.toLocaleString()}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <ShieldAlert
              className="h-4 w-4"
              style={{ color: "var(--warning)" }}
            />
            <span>Suspended</span>
          </div>

          <span className="tabular-nums font-medium">
            {metrics.suspendedVendors.toLocaleString()}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Ban
              className="h-4 w-4"
              style={{ color: "var(--destructive)" }}
            />
            <span>Banned</span>
          </div>

          <span className="tabular-nums font-medium">
            {metrics.bannedVendors.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  )
}