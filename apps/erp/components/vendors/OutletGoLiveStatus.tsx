import { CheckCircle2, CircleSlash, Clock } from "lucide-react"
import type { OutletGoLiveStatus, OutletGoLiveBlocker } from "@/types"

/*
 * Admin-facing render of the backend's getOutletGoLiveStatus. Factual, not
 * instructional (that's the vendor dashboard's job) — an admin looking at an
 * outlet wants to know at a glance why it isn't taking orders and whether
 * that's a vendor problem or a platform one.
 */

const BLOCKER_LABEL: Record<OutletGoLiveBlocker, { text: string; owner: "vendor" | "platform" }> = {
  PENDING_DOCUMENTS          : { text: "A required CRITICAL document is not approved", owner: "vendor" },
  REVIEW_REJECTED            : { text: "Rejected in content review", owner: "vendor" },
  OUTLET_SUSPENDED           : { text: "Admin-suspended", owner: "platform" },
  OUTLET_SUSPENDED_COMPLIANCE: { text: "Auto-suspended — CRITICAL document expired", owner: "vendor" },
  OUTLET_BANNED              : { text: "Banned", owner: "platform" },
  OUTLET_DEACTIVATED         : { text: "Vendor deactivated this outlet", owner: "vendor" },
  TEMPORARILY_CLOSED         : { text: "Vendor marked it temporarily closed", owner: "vendor" },
  VENDOR_NOT_LIVE            : { text: "Vendor storefront not published", owner: "vendor" },
  ZONE_LEVEL_TOO_LOW         : { text: "Outlet's zone doesn't allow orders yet (registration-only / unzoned)", owner: "platform" },
  ZONE_NOT_OPERATIONAL       : { text: "Outlet's zone is paused, or the city is inactive", owner: "platform" },
}

const LEVEL_LABEL: Record<string, string> = {
  REGISTRATION_ONLY: "Registration only",
  MARKETPLACE      : "Marketplace",
  PLATFORM_DELIVERY: "Platform delivery",
  FULL_OPERATIONS  : "Full operations",
}

export function OutletGoLiveStatus({ status }: { status: OutletGoLiveStatus }) {
  return (
    <div className="admin-card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Go-live status</h2>
        {status.isAcceptingOrders
          ? <span className="badge-success inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Accepting orders</span>
          : status.isClearedToServe
            ? <span className="badge-warning">Cleared — vendor not live</span>
            : <span className="badge-danger inline-flex items-center gap-1"><CircleSlash className="h-3 w-3" /> Not live</span>}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        <Row label="Clearance" value={status.clearanceStatus === "CLEARED" ? "Cleared" : "Pending documents"} />
        <Row label="Zone" value={status.zone.name ?? "Unzoned"} />
        <Row label="Zone level" value={status.zone.level ? (LEVEL_LABEL[status.zone.level] ?? status.zone.level) : "—"} />
        <Row label="Zone status" value={status.zone.operationalStatus ?? "—"} />
        <Row label="On-demand allowed" value={status.zone.onDemandAllowed ? "Yes" : "No"} />
        <Row label="Vendor published" value={status.vendorPublished ? "Yes" : "No"} />
      </dl>

      {status.blockers.length > 0 && (
        <ul className="space-y-1.5 border-t border-border pt-3">
          {status.blockers.map((b) => {
            const meta = BLOCKER_LABEL[b]
            return (
              <li key={b} className="flex items-start gap-2 text-xs">
                {meta.owner === "platform"
                  ? <Clock className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  : <CircleSlash className="mt-0.5 h-3 w-3 shrink-0 text-warning" />}
                <span className="text-foreground">{meta.text}</span>
                <span className="ml-auto shrink-0 text-muted-foreground">{meta.owner}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  )
}
