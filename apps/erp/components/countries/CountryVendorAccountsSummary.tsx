import { Briefcase } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import type { CountryVendorSnapshot } from "@repo/types/admin-app"

interface Props {
  snapshot: CountryVendorSnapshot | null
}

/**
 * Vendor ACCOUNTS only (not applications — see CountryVendorApplicationsSummary
 * for that). Just the total — the breakdown (active/suspended/banned) lives
 * on /countries/[slug]/vendors, not crammed into this card.
 */
export function CountryVendorAccountsSummary({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No vendors yet"
        description="Vendor accounts in this country will show up here."
      />
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-3.5">
      <div className="icon-badge icon-badge-primary h-11 w-11 shrink-0">
        <Briefcase className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-semibold leading-none tabular-nums text-foreground">
          {snapshot.accounts.total.toLocaleString()}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Total vendors</p>
      </div>
    </div>
  )
}
