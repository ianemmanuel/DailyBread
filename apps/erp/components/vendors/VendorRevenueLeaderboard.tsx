import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { ArrowUpRight, ArrowDownRight } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import { formatCurrency } from "@/lib/mock/country-revenue"

export interface VendorRevenueEntry {
  id: string
  name: string
  subtitle?: string
  value: number
  deltaPct: number
  /** Omit to render as a plain (non-linked) row — used for outlets, which have no detail page yet. */
  href?: string
}

interface Props {
  title: string
  description: string
  icon: LucideIcon
  badgeClass: string
  entries: VendorRevenueEntry[]
  emptyTitle: string
  emptyDescription: string
  /** ISO 4217 code — omit for USD (the right default for a cross-country/aggregate leaderboard; pass the selected country's own code once a leaderboard is locked to one country). */
  currencyCode?: string | null
}

/**
 * Ranked leaderboard for the Finance domain — same visual shape as
 * RevenueRankedList (components/countries), but keyed by id (not slug) and
 * with an optional href so it can render both linkable rows (vendors/
 * cities → their detail/drill-down page) and non-linkable ones.
 */
export function VendorRevenueLeaderboard({ title, description, icon: Icon, badgeClass, entries, emptyTitle, emptyDescription, currencyCode }: Props) {
  return (
    <div className="admin-card">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className={`icon-badge h-9 w-9 shrink-0 ${badgeClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={Icon} title={emptyTitle} description={emptyDescription} />
      ) : (
        <ul className="space-y-1">
          {entries.map((entry, i) => {
            const isPositive = entry.deltaPct >= 0
            const row = (
              <span className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/40">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-medium text-foreground ${entry.href ? "transition-colors group-hover:text-primary" : ""}`}>
                    {entry.name}
                  </span>
                  {entry.subtitle && (
                    <span className="block truncate text-xs text-muted-foreground">{entry.subtitle}</span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {formatCurrency(entry.value, currencyCode)}
                </span>
                <span className={`inline-flex shrink-0 items-center gap-0.5 text-xs font-medium tabular-nums ${isPositive ? "text-success" : "text-destructive"}`}>
                  {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(entry.deltaPct)}%
                </span>
              </span>
            )
            return <li key={entry.id}>{entry.href ? <Link href={entry.href}>{row}</Link> : row}</li>
          })}
        </ul>
      )}
    </div>
  )
}
