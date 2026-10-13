import { FileText, Clock, CheckCircle, XCircle, Briefcase, Ban, ShieldAlert } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import type { CountryVendorSnapshot } from "@repo/types/admin-app"

interface Props {
  snapshot: CountryVendorSnapshot | null
}

function Stat({ icon: Icon, value, label }: { icon: React.ElementType; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <p className="min-w-0 truncate text-sm">
        <span className="font-semibold tabular-nums text-foreground">{value.toLocaleString()}</span>{" "}
        <span className="text-xs text-muted-foreground">{label}</span>
      </p>
    </div>
  )
}

/**
 * Aggregate-only, deliberately compact — no individual applications are
 * listed here (that detail lives on /vendors/applications). Applications
 * and accounts share one dense grid instead of two labeled sections, to
 * keep this card's footprint reasonable next to everything else on the
 * country page.
 */
export function VendorSnapshotSummary({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <EmptyState
        icon={FileText}
        title="No vendor data yet"
        description="Vendor onboarding metrics will appear here once applications start coming in."
      />
    )
  }

  const { applications, accounts, vendorTypes } = snapshot

  return (
    <div className="admin-card space-y-3">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
        <Stat icon={FileText}    value={applications.submitted}   label="submitted" />
        <Stat icon={Clock}       value={applications.underReview} label="in review" />
        <Stat icon={CheckCircle} value={applications.approved}    label="approved" />
        <Stat icon={XCircle}     value={applications.rejected}    label="rejected" />
        <Stat icon={Briefcase}   value={accounts.total}           label="accounts" />
        <Stat icon={ShieldAlert} value={accounts.suspended}       label="suspended" />
        <Stat icon={Ban}         value={accounts.banned}          label="banned" />
      </div>

      {vendorTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {vendorTypes.map((vt) => (
            <span key={vt.name} className="badge-neutral">
              {vt.name} · {vt.count}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
