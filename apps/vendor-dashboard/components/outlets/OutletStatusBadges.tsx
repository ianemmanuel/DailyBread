"use client"

import type { OutletAdminStatus, OutletReviewStatus, Outlet } from "@/types/outlet"

function AdminStatusBadge({ status }: { status: OutletAdminStatus }) {
  if (status === "ACTIVE")    return <span className="badge-success">Active</span>
  if (status === "SUSPENDED") return <span className="badge-warning">Suspended</span>
  if (status === "BANNED")    return <span className="badge-danger">Banned</span>
  return null
}

function ReviewStatusBadge({ status }: { status: OutletReviewStatus }) {
  if (status === "AUTO_APPROVED" || status === "MANUALLY_APPROVED") return null
  if (status === "FLAGGED") {
    return <span className="badge-warning">Under Review</span>
  }
  if (status === "MANUALLY_REJECTED") {
    return <span className="badge-danger">Rejected</span>
  }
  return null
}

export function OutletStatusBadges({ outlet }: { outlet: Pick<Outlet, "adminStatus" | "reviewStatus" | "isTemporarilyClosed" | "vendorDisabledAt"> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {outlet.vendorDisabledAt ? (
        <span className="badge-info">Deactivated</span>
      ) : (
        <AdminStatusBadge status={outlet.adminStatus} />
      )}
      {outlet.isTemporarilyClosed && (
        <span className="badge-warning">Temporarily Closed</span>
      )}
      <ReviewStatusBadge status={outlet.reviewStatus} />
    </div>
  )
}