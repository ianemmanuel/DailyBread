import { FileText } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import type { CountryVendorSnapshot } from "@repo/types/admin-app"

interface Props {
  snapshot: CountryVendorSnapshot | null
}

/**
 * Application PIPELINE — just submitted count. The full status breakdown
 * (in review/approved/rejected) lives on /countries/[slug]/vendor-applications,
 * not crammed into this card.
 */
export function CountryVendorApplicationsSummary({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <EmptyState
        icon={FileText}
        title="No applications yet"
        description="Vendor applications submitted in this country will show up here."
      />
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-3.5">
      <div className="icon-badge icon-badge-info h-11 w-11 shrink-0">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-semibold leading-none tabular-nums text-foreground">
          {snapshot.applications.submitted.toLocaleString()}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Submitted applications</p>
      </div>
    </div>
  )
}
