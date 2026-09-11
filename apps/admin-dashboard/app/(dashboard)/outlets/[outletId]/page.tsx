import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Flag, ShieldAlert, Ban } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { getInitials } from "@/lib/initials"
import { OutletModerationActions } from "@/components/vendors/OutletModerationActions"
import { OutletLocationCard } from "@/components/vendors/OutletLocationCard"
import { OutletGoLiveStatus } from "@/components/vendors/OutletGoLiveStatus"
import { OutletDocumentsPanel } from "@/components/vendors/OutletDocumentsPanel"
import { OutletMealPlanReadiness } from "@/components/vendors/OutletMealPlanReadiness"
import { OutletInspectionsPanel } from "@/components/vendors/OutletInspectionsPanel"
import { AdminPermissions } from "@repo/types/admin-app"
import type { AdminOutlet, OutletReviewStatus, AdminOutletDocumentRow, OutletInspectionRow } from "@/types"

export const metadata: Metadata = { title: "Outlet" }

interface Props { params: Promise<{ outletId: string }> }

const REVIEW_BADGE: Record<OutletReviewStatus, string> = {
  AUTO_APPROVED     : "badge-success",
  FLAGGED           : "badge-warning",
  MANUALLY_APPROVED : "badge-success",
  MANUALLY_REJECTED : "badge-danger",
}
const REVIEW_LABEL: Record<OutletReviewStatus, string> = {
  AUTO_APPROVED: "Auto-approved", FLAGGED: "Flagged", MANUALLY_APPROVED: "Approved", MANUALLY_REJECTED: "Rejected",
}
const ADMIN_STATUS_BADGE: Record<string, string> = {
  ACTIVE: "badge-success", SUSPENDED: "badge-warning", SUSPENDED_COMPLIANCE: "badge-warning", BANNED: "badge-danger",
}
const ADMIN_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active", SUSPENDED: "Suspended", SUSPENDED_COMPLIANCE: "Suspended · document expired", BANNED: "Banned",
}
const FLAG_REASON_LABEL: Record<string, string> = {
  INAPPROPRIATE_NAME    : "Inappropriate name",
  DUPLICATE_NAME_IN_CITY: "Duplicate name in city",
  DUPLICATE_COORDINATES : "Duplicate coordinates",
}

export default async function OutletDetailPage({ params }: Props) {
  const { outletId } = await params
  const session = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.VENDORS_OUTLETS_READ)) redirect("/vendors")
  const canModerate  = session.permissions.includes(AdminPermissions.VENDORS_OUTLETS_MODERATE)
  const canInspect   = session.permissions.includes(AdminPermissions.VENDORS_OUTLETS_INSPECT)
  const canReadZones = session.permissions.includes(AdminPermissions.SETTINGS_ZONES_READ)

  let outlet: AdminOutlet
  try {
    outlet = await adminFetch<AdminOutlet>(`/admin/v1/vendors/outlets/${outletId}`, {
      next: { revalidate: 60, tags: [`outlet-${outletId}`, "vendor-outlets-admin"] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const [outletDocuments, outletInspections] = await Promise.all([
    adminFetch<AdminOutletDocumentRow[]>(
      `/admin/v1/vendors/outlets/${outletId}/documents`,
      { next: { revalidate: 60, tags: [`outlet-${outletId}`] } },
    ).catch(() => [] as AdminOutletDocumentRow[]),
    adminFetch<OutletInspectionRow[]>(
      `/admin/v1/vendors/outlets/${outletId}/inspections`,
      { next: { revalidate: 60, tags: [`outlet-${outletId}`] } },
    ).catch(() => [] as OutletInspectionRow[]),
  ])

  return (
    <div className="page-content animate-slide-up">
      <Link
        href="/outlets"
        className="group inline-flex w-fit items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card shadow-[var(--shadow-xs)] transition-all group-hover:-translate-x-0.5 group-hover:border-primary/40 group-hover:text-primary">
          <ArrowLeft className="h-4 w-4" />
        </span>
        Back to Outlets
      </Link>

      <div className="admin-card flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="avatar-circle h-14 w-14 shrink-0 text-lg">
            {getInitials(outlet.name)}
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold text-foreground">{outlet.name}</h1>
            <Link href={`/vendors/accounts/${outlet.vendorId}`} className="text-sm text-primary hover:underline">
              {outlet.vendor.legalBusinessName}
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={REVIEW_BADGE[outlet.reviewStatus]}>{REVIEW_LABEL[outlet.reviewStatus]}</span>
              <span className={ADMIN_STATUS_BADGE[outlet.adminStatus]}>{ADMIN_STATUS_LABEL[outlet.adminStatus] ?? outlet.adminStatus}</span>
              {outlet.clearanceStatus === "PENDING_DOCUMENTS" && <span className="badge-warning">Pending document</span>}
              {outlet.isMainOutlet && <span className="badge-neutral">Main outlet</span>}
              {outlet.isTemporarilyClosed && <span className="badge-warning">Temporarily closed</span>}
            </div>
          </div>
        </div>

        <OutletModerationActions outlet={outlet} canModerate={canModerate} />
      </div>

      {outlet.reviewStatus === "MANUALLY_REJECTED" && outlet.rejectionReason && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive-bg px-5 py-4">
          <p className="text-sm font-semibold text-destructive">Rejected</p>
          <p className="mt-0.5 text-sm text-foreground">{outlet.rejectionReason}</p>
        </div>
      )}

      {outlet.flagReasons.length > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning-bg px-5 py-4">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 shrink-0 text-warning" />
            <p className="text-sm font-semibold text-foreground">Flagged</p>
          </div>
          <p className="mt-0.5 text-sm text-foreground">
            {outlet.flagReasons.map((r) => FLAG_REASON_LABEL[r] ?? r).join(", ")}
          </p>
          {outlet.flaggedAt && <p className="mt-1 text-xs text-muted-foreground">Since {new Date(outlet.flaggedAt).toLocaleDateString()}</p>}
        </div>
      )}

      {outlet.adminStatus === "SUSPENDED" && (
        <div className="rounded-2xl border border-warning/30 bg-warning-bg px-5 py-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
            <p className="text-sm font-semibold text-warning">Suspended</p>
          </div>
          <p className="mt-0.5 text-sm text-foreground">{outlet.adminSuspensionReason ?? "No reason on record"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {outlet.adminSuspendedAt && `Since ${new Date(outlet.adminSuspendedAt).toLocaleDateString()}`}
            {outlet.adminSuspendUntil && ` — until ${new Date(outlet.adminSuspendUntil).toLocaleDateString()}`}
          </p>
        </div>
      )}

      {outlet.adminStatus === "SUSPENDED_COMPLIANCE" && (
        <div className="rounded-2xl border border-warning/30 bg-warning-bg px-5 py-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
            <p className="text-sm font-semibold text-warning">Suspended — document expired</p>
          </div>
          <p className="mt-0.5 text-sm text-foreground">
            A CRITICAL required document for this outlet expired past its grace window. The outlet
            returns to active automatically once the vendor uploads a current version and it is
            approved below.
          </p>
        </div>
      )}

      {outlet.adminStatus === "BANNED" && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive-bg px-5 py-4">
          <div className="flex items-center gap-2">
            <Ban className="h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm font-semibold text-destructive">Banned</p>
          </div>
          <p className="mt-0.5 text-sm text-foreground">{outlet.adminBanReason ?? "No reason on record"}</p>
          {outlet.adminBannedAt && <p className="mt-1 text-xs text-muted-foreground">Since {new Date(outlet.adminBannedAt).toLocaleDateString()}</p>}
        </div>
      )}

      {outlet.goLiveStatus && <OutletGoLiveStatus status={outlet.goLiveStatus} />}

      {outlet.mealPlanReadiness && <OutletMealPlanReadiness readiness={outlet.mealPlanReadiness} />}

      <OutletInspectionsPanel
        outletId={outletId}
        inspections={outletInspections}
        canInspect={canInspect}
        inspectionRequired={outlet.mealPlanReadiness?.inspectionRequired ?? true}
      />

      <OutletDocumentsPanel outletId={outletId} documents={outletDocuments} canModerate={canModerate} />

      <OutletLocationCard outlet={outlet} coverage={outlet.coverage ?? null} canReadZones={canReadZones} />
    </div>
  )
}
