"use client"

import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DocumentRow } from "@/components/vendors/DocumentRow"
import type { Doc } from "@/types/vendor.types"

interface Props {
  docs              : Doc[]
  applicationId     : string
  /** VENDORS_DOCUMENTS_VIEW — the permission the backend actually checks for per-document approve/reject */
  canActOnDocuments : boolean
  /** Live status per document id — owned by the parent so the sidebar Decision panel can gate Approve on it too */
  statusMap         : Record<string, string>
  /**
   * Optional — omitted when this is rendered read-only directly from a
   * Server Component page (e.g. the vendor account detail page), where
   * canActOnDocuments is always false so this is never actually invoked.
   * Function props can't cross the server→client boundary, so the no-op
   * default has to live here rather than be passed in from a server page.
   */
  onStatusChange?   : (docId: string, newStatus: string) => void
}

/**
 * Pure documents table — no longer owns approval-gate state or renders
 * application-level actions itself. Both live in the parent
 * (ApplicationWorkspace) so the Decision panel can react to document
 * status without an application needing any documents at all to be
 * reviewable in the first place.
 */
export function DocumentsSection({ docs, applicationId, canActOnDocuments, statusMap, onStatusChange = () => {} }: Props) {
  const approvedCount = Object.values(statusMap).filter((s) => s === "APPROVED").length

  return (
    <div className="admin-card overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          Documents ({docs.length})
        </h2>
        <span className={approvedCount === docs.length ? "badge-success" : "badge-neutral"}>
          {approvedCount} / {docs.length} approved
        </span>
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
              canActOnDocuments={canActOnDocuments}
              applicationId={applicationId}
              onStatusChange={onStatusChange}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
