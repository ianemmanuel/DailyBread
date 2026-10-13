import { FileText } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import { scopeLabel } from "@/components/document-types/ActiveDocumentsTable"
import type { DocumentTypeConfig } from "@/types/document-type.types"

interface Props {
  documentTypes: DocumentTypeConfig[]
}

const PREVIEW_LIMIT = 5

/**
 * Read-only, capped-at-5 preview — no add-document here, that workflow
 * moved to /countries/[slug]/documents. Section title + "View more" live
 * in the caller's SectionViewMoreHeader.
 */
export function CountryDocumentsPreview({ documentTypes }: Props) {
  if (documentTypes.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No documents yet"
        description="Vendors can't upload the documents they need until at least one is created for this country."
      />
    )
  }

  return (
    <ul className="divide-y divide-border/60">
      {documentTypes.slice(0, PREVIEW_LIMIT).map((dt) => (
        <li key={dt.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="icon-badge icon-badge-info h-8 w-8 shrink-0">
              <FileText className="h-3.5 w-3.5" />
            </div>
            <p className="truncate text-sm font-medium text-foreground">{dt.name}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={dt.isRequired ? "badge-warning" : "badge-neutral"}>
              {dt.isRequired ? "Mandatory" : "Optional"}
            </span>
            <span className="badge-neutral">{scopeLabel(dt)}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}
