import type { Metadata }         from "next"
import { redirect, notFound }    from "next/navigation"
import { BackButton } from "@/components/shared/BackButton"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession }       from "@/lib/auth/session"
import { VendorApplicationStatusBadge } from "@/components/vendors/VendorApplicationStatusBadge"
import { ApplicationWorkspace }  from "@/components/vendors/ApplicationWorkspace"
import { LogAppealDialog }       from "@/components/vendors/LogAppealDialog"
import { AdminPermissions }      from "@repo/types/admin-app"
import { getInitials }           from "@/lib/initials"
import type { ApplicationDetail } from "@/types"

export const metadata: Metadata = { title: "Application Review" }

interface Props { params: Promise<{ id: string }> }

export default async function ApplicationDetailPage({ params }: Props) {
  const { id }    = await params
  const session   = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.VENDORS_APPLICATIONS_READ)) redirect("/vendors")

  let application: ApplicationDetail
  try {
    application = await adminFetch<ApplicationDetail>(`/admin/v1/vendors/applications/${id}`, {
      next: { revalidate: 60, tags: [`vendor-application-${id}`] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  // The backend gates each mutation on a distinct permission — the UI
  // mirrors that instead of one coarse "canApprove" flag (see
  // admin.vendor.routes.ts): review is the base capability, approve/reject
  // stack on top of it, and document actions use a separate permission.
  const canReview          = session.permissions.includes(AdminPermissions.VENDORS_APPLICATIONS_REVIEW)
  const canApprove         = canReview && session.permissions.includes(AdminPermissions.VENDORS_APPLICATIONS_APPROVE)
  const canReject          = canReview && session.permissions.includes(AdminPermissions.VENDORS_APPLICATIONS_REJECT)
  const canClaim           = canReview && session.permissions.includes(AdminPermissions.VENDORS_APPLICATIONS_CLAIM)
  const canReassign        = session.permissions.includes(AdminPermissions.VENDORS_APPLICATIONS_REASSIGN)
  const canEscalate        = canReview && session.permissions.includes(AdminPermissions.VENDORS_APPLICATIONS_ESCALATE)
  // Escalated applications stay with the local country team — a
  // globally-scoped holder of this permission can't self-claim out of the
  // pool (see claimApplication's country-scope block), so the frontend
  // shouldn't offer the button either. Same pattern as
  // ComplianceIssueActions' canReceiveEscalation.
  const canReceiveEscalation = session.permissions.includes(AdminPermissions.VENDORS_APPLICATIONS_RECEIVE_ESCALATION)
    && !session.scope.isGlobal && !!application.country?.id && session.scope.countryIds.includes(application.country.id)
  const canActOnDocuments  = session.permissions.includes(AdminPermissions.VENDORS_DOCUMENTS_VIEW)
  // Roadmap VM-P1-04 (CLAUDE.md) — log a formal appeal against the rejection.
  const canLogAppeal       = session.permissions.includes(AdminPermissions.VENDORS_APPEALS_MANAGE)

  const displayName  = [application.ownerFirstName, application.ownerLastName].filter(Boolean).join(" ") || "—"
  const initials     = getInitials(application.legalBusinessName ?? "?")
  const isRejected   = application.status === "REJECTED"
  const isRevision   = application.status === "NEEDS_REVISION"
  const submittedLabel = application.submittedAt
    ? new Date(application.submittedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "Not submitted"

  const businessFields: [string, string][] = [
    ["Business phone",   application.businessPhone ?? "—"],
    ["Registration No.", application.registrationNumber ?? "—"],
    ["Tax ID",           application.taxId ?? "—"],
    ["Address",          application.businessAddress ?? "—"],
    // Roadmap Phase 2 (CLAUDE.md) — legal/audit trail for terms
    // acceptance. Stays "Not yet captured" until vendor-dashboard sends
    // termsVersion on submit — that integration is separate, later work.
    ["Terms accepted", application.termsAcceptedAt
      ? `v${application.termsVersion ?? "?"} — ${new Date(application.termsAcceptedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`
      : "Not yet captured"],
  ]

  const ownerFields: [string, string][] = [
    ["Owner",       displayName],
    ["Owner email", application.ownerEmail ?? "—"],
    ["Owner phone", application.ownerPhone ?? "—"],
  ]

  return (
    <div className="page-content animate-slide-up">

      <BackButton href="/vendors/applications">Back to Applications</BackButton>

      {/* Hero header */}
      <div className="admin-card flex items-center gap-4">
        <div className="avatar-circle h-14 w-14 shrink-0 text-lg">
          {initials}
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold text-foreground">
            {application.legalBusinessName}
          </h1>
          <p className="truncate text-sm text-muted-foreground">{application.businessEmail}</p>
        </div>
        <div className="ml-auto shrink-0">
          <VendorApplicationStatusBadge status={application.status} />
        </div>
      </div>

      {/* Rejection / revision banner — same underlying fields, different terminal meaning */}
      {(isRejected || isRevision) && application.rejectionReason && (
        <div
          className={[
            "rounded-2xl border px-5 py-4 space-y-1",
            isRejected ? "border-destructive/30 bg-destructive-bg" : "border-warning/30 bg-warning-bg",
          ].join(" ")}
        >
          <p className={`text-sm font-semibold ${isRejected ? "text-destructive" : "text-warning"}`}>
            {isRejected ? "Rejected" : "Needs Revision"}
          </p>
          <p className="text-sm text-foreground">{application.rejectionReason}</p>
          {application.revisionNotes && (
            <p className="text-xs text-muted-foreground">{application.revisionNotes}</p>
          )}
          {isRejected && canLogAppeal && (
            <div className="pt-1">
              <LogAppealDialog subjectType="APPLICATION_REJECTION" applicationId={id} />
            </div>
          )}
        </div>
      )}

      <ApplicationWorkspace
        applicationId={id}
        currentStatus={application.status}
        docs={application.documents ?? []}
        canActOnDocuments={canActOnDocuments}
        canReview={canReview}
        canApprove={canApprove}
        canReject={canReject}
        canClaim={canClaim}
        canReassign={canReassign}
        canEscalate={canEscalate}
        canReceiveEscalation={canReceiveEscalation}
        assignedReviewerId={application.assignedReviewerId}
        assignedReviewerName={application.assignedReviewerName}
        escalatedByAdminId={application.escalatedByAdminId}
        escalatedByAdminName={application.escalatedByAdminName}
        escalationReason={application.escalationReason}
        currentAdminId={session.id}
        vendorTypeName={application.vendorType?.name}
        countryName={application.country?.name}
        submittedLabel={submittedLabel}
        revisionCount={application.revisionCount ?? 0}
      >
        <div className="admin-card space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Business Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {businessFields.map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-sm text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-card space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Owner &amp; Contact</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {ownerFields.map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-sm text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </ApplicationWorkspace>

    </div>
  )
}
