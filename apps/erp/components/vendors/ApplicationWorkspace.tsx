"use client"

import { useState, useCallback } from "react"
import { DocumentsSection }    from "@/components/vendors/DocumentsSection"
import { ApplicationActions }  from "@/components/vendors/ApplicationActions"
import { VendorApplicationStatusBadge } from "@/components/vendors/VendorApplicationStatusBadge"
import type { Doc } from "@/types/vendor.types"

interface Props {
  applicationId    : string
  currentStatus    : string
  docs             : Doc[]
  canActOnDocuments: boolean
  canReview        : boolean
  canApprove       : boolean
  canReject        : boolean
  /** VENDORS_APPLICATIONS_CLAIM */
  canClaim         : boolean
  /** VENDORS_APPLICATIONS_REASSIGN */
  canReassign      : boolean
  /** VENDORS_APPLICATIONS_ESCALATE */
  canEscalate      : boolean
  /** VENDORS_APPLICATIONS_RECEIVE_ESCALATION */
  canReceiveEscalation: boolean
  assignedReviewerId  : string | null
  assignedReviewerName: string | null
  escalatedByAdminId   : string | null
  escalatedByAdminName : string | null
  escalationReason     : string | null
  currentAdminId     : string
  vendorTypeName?  : string | null
  countryName?     : string | null
  submittedLabel   : string
  revisionCount    : number
  /** Business/owner detail cards — server-rendered, passed through untouched */
  children: React.ReactNode
}

/**
 * Owns the one piece of state that has to be shared between the documents
 * table and the Decision panel — which documents are currently APPROVED —
 * so Approve can be gated live as a reviewer works through the list,
 * without a page reload. Everything else (business/owner details) stays a
 * plain server-rendered child, not lifted into this client boundary.
 */
export function ApplicationWorkspace({
  applicationId, currentStatus, docs, canActOnDocuments, canReview, canApprove, canReject, canClaim,
  canReassign, canEscalate, canReceiveEscalation,
  assignedReviewerId, assignedReviewerName, currentAdminId,
  escalatedByAdminId, escalatedByAdminName, escalationReason,
  vendorTypeName, countryName, submittedLabel, revisionCount, children,
}: Props) {
  const [statusMap, setStatusMap] = useState<Record<string, string>>(
    () => Object.fromEntries(docs.map((d) => [d.id, d.status])),
  )

  const handleStatusChange = useCallback((docId: string, newStatus: string) => {
    setStatusMap((prev) => ({ ...prev, [docId]: newStatus }))
  }, [])

  const allDocsApproved =
    docs.length > 0 && Object.values(statusMap).every((s) => s === "APPROVED")

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="min-w-0 space-y-4 lg:col-span-2">
        {children}
        {docs.length > 0 && (
          <DocumentsSection
            docs={docs}
            applicationId={applicationId}
            canActOnDocuments={canActOnDocuments}
            statusMap={statusMap}
            onStatusChange={handleStatusChange}
          />
        )}
      </div>

      <div className="lg:col-span-1">
        <div className="sticky top-24 space-y-4">
          <div className="admin-card space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Summary</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Status</dt>
                <dd><VendorApplicationStatusBadge status={currentStatus} /></dd>
              </div>
              {vendorTypeName && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd className="font-medium text-foreground">{vendorTypeName}</dd>
                </div>
              )}
              {countryName && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Country</dt>
                  <dd className="font-medium text-foreground">{countryName}</dd>
                </div>
              )}
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Submitted</dt>
                <dd className="font-medium text-foreground">{submittedLabel}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Revisions</dt>
                <dd className="font-medium tabular-nums text-foreground">{revisionCount}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Reviewer</dt>
                <dd className="font-medium text-foreground">
                  {!assignedReviewerId
                    ? <span className="text-muted-foreground">Unclaimed</span>
                    : assignedReviewerId === currentAdminId
                      ? "You"
                      : assignedReviewerName ?? "Another reviewer"}
                </dd>
              </div>
              {escalatedByAdminId && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Escalated by</dt>
                  <dd className="font-medium text-warning">
                    {escalatedByAdminId === currentAdminId ? "You" : escalatedByAdminName ?? "Another admin"}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {(canReview || canReassign || canEscalate) && (
            <ApplicationActions
              applicationId={applicationId}
              currentStatus={currentStatus}
              allDocsApproved={docs.length === 0 ? true : allDocsApproved}
              canReview={canReview}
              canApprove={canApprove}
              canReject={canReject}
              canClaim={canClaim}
              canReassign={canReassign}
              canEscalate={canEscalate}
              canReceiveEscalation={canReceiveEscalation}
              assignedReviewerId={assignedReviewerId}
              assignedReviewerName={assignedReviewerName}
              currentAdminId={currentAdminId}
              escalatedByAdminId={escalatedByAdminId}
              escalatedByAdminName={escalatedByAdminName}
              escalationReason={escalationReason}
            />
          )}
        </div>
      </div>
    </div>
  )
}
