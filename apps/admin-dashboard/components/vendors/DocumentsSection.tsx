"use client"

import { useState, useCallback } from "react"
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import { DocumentRow }        from "@/components/vendors/DocumentRow"
import { ApplicationActions } from "@/components/vendors/ApplicationActions"
import type { Doc } from "@/types/vendor.types"

interface Props {
  docs          : Doc[]
  applicationId : string
  currentStatus : string
  canApprove    : boolean
}

/**
 * Client wrapper that owns the live document status map.
 *
 * Each DocumentRow bubbles up status changes via onStatusChange.
 * This component derives `allDocsApproved` and passes it to ApplicationActions
 * so the application-level Approve button is gated correctly — all documents
 * must be APPROVED (not just settled) before the application can be approved.
 *
 * No page reload needed: the gate reacts instantly as docs get approved.
 */
export function DocumentsSection({ docs, applicationId, currentStatus, canApprove }: Props) {
  // Seed with server-rendered statuses; updated optimistically on each doc action
  const [statusMap, setStatusMap] = useState<Record<string, string>>(
    () => Object.fromEntries(docs.map((d) => [d.id, d.status])),
  )

  const handleStatusChange = useCallback((docId: string, newStatus: string) => {
    setStatusMap((prev) => ({ ...prev, [docId]: newStatus }))
  }, [])

  // Every single document must be APPROVED — pending or rejected blocks the gate
  const allDocsApproved =
    docs.length > 0 &&
    Object.values(statusMap).every((s) => s === "APPROVED")

  return (
    <div className="space-y-0">
      {/* Documents table */}
      <div className="admin-card overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Documents ({docs.length})
          </h2>
          {/* Compact doc-approval progress indicator */}
          <p className="text-xs text-muted-foreground">
            {Object.values(statusMap).filter((s) => s === "APPROVED").length}
            {" / "}
            {docs.length} approved
          </p>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs uppercase tracking-wide">Document</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Expiry</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-right pr-4">Preview</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                canApprove={canApprove}
                applicationId={applicationId}
                onStatusChange={handleStatusChange}
              />
            ))}
          </TableBody>
        </Table>

        {/* Application-level actions sit at the bottom of the card, below the table */}
        {canApprove && (
          <div className="flex items-center justify-between border-t border-border/60 px-5 py-3">
            {!allDocsApproved ? (
              <p className="text-xs text-muted-foreground">
                All documents must be approved before the application can be approved.
              </p>
            ) : (
              <p className="text-xs text-green-600 font-medium">
                All documents approved — application is ready to approve.
              </p>
            )}
            <ApplicationActions
              applicationId={applicationId}
              currentStatus={currentStatus}
              allDocsApproved={allDocsApproved}
            />
          </div>
        )}
      </div>
    </div>
  )
}