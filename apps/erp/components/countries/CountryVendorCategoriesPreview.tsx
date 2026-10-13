import { Tag } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import type { CountryVendorTypeLink } from "@/types/vendor-type.types"

interface Props {
  vendorTypes: CountryVendorTypeLink[]
}

const PREVIEW_LIMIT = 5

/**
 * Read-only, capped-at-5 preview — no assign/remove here, that workflow
 * moved to /countries/[slug]/vendor-categories (CountryVendorCategoriesManager).
 * Section title + "View more" live in the caller's SectionViewMoreHeader.
 */
export function CountryVendorCategoriesPreview({ vendorTypes }: Props) {
  if (vendorTypes.length === 0) {
    return (
      <EmptyState
        icon={Tag}
        title="No vendor categories linked yet"
        description="Vendors can't select this country during onboarding until at least one category is assigned."
      />
    )
  }

  return (
    <ul className="divide-y divide-border/60">
      {vendorTypes.slice(0, PREVIEW_LIMIT).map((link) => (
        <li key={link.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="icon-badge icon-badge-primary h-8 w-8 shrink-0">
              <Tag className="h-3.5 w-3.5" />
            </div>
            <p className="truncate text-sm font-medium text-foreground">{link.vendorType.name}</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {(link.vendorAccountCount ?? 0).toLocaleString()} vendors
          </span>
        </li>
      ))}
    </ul>
  )
}
