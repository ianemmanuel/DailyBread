import { FileText } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import type { DocumentTypeConfig } from "@/types/document-type.types"

interface Props {
  documentTypes: DocumentTypeConfig[]
}

/**
 * "Baking certificate — Bakeries, Restaurants, Commercial Kitchens" — which
 * vendor categories each active document applies to. A document with no
 * DocumentTypeVendorType links applies to every category by default (see
 * vendor.document.service.ts#getAllowedDocumentTypes) — shown as "All
 * vendor categories" rather than an empty list.
 */
export function DocumentVendorCategoryGroups({ documentTypes }: Props) {
  if (documentTypes.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Nothing to show yet"
        description="Once documents are created, which vendor categories each one applies to will show up here."
      />
    )
  }

  return (
    <ul className="space-y-2">
      {documentTypes.map((dt) => (
        <li key={dt.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
          <span className="text-sm font-medium text-foreground">{dt.name}</span>
          <span className="text-xs text-muted-foreground">—</span>
          {dt.vendorTypeConfigs.length === 0 ? (
            <span className="badge-info">All vendor categories</span>
          ) : (
            dt.vendorTypeConfigs.map((c) => (
              <span key={c.id} className="badge-neutral">{c.vendorType.name}</span>
            ))
          )}
        </li>
      ))}
    </ul>
  )
}
