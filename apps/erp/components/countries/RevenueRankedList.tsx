import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { ArrowUpRight, ArrowDownRight } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import { formatMockCurrency } from "@/lib/mock/country-revenue"

export interface RevenueRankedEntry {
  slug: string
  name: string
  value: number
  deltaPct: number
}

interface Props {
  title      : string
  description: string
  icon       : LucideIcon
  badgeClass : string
  entries    : RevenueRankedEntry[]
  emptyTitle : string
  emptyDescription: string
}

/**
 * STATIC — no Orders/Payments model exists yet, see lib/mock/country-revenue.ts.
 * Shared ranked-list shape for both "top revenue" and "countries with
 * losses" — same structure, different data/framing, so one component.
 */
export function RevenueRankedList({ title, description, icon: Icon, badgeClass, entries, emptyTitle, emptyDescription }: Props) {
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
            return (
              <li key={entry.slug}>
                <Link
                  href={`/countries/${entry.slug}`}
                  className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/40"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                    {entry.name}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {formatMockCurrency(entry.value)}
                  </span>
                  <span className={`inline-flex shrink-0 items-center gap-0.5 text-xs font-medium tabular-nums ${isPositive ? "text-success" : "text-destructive"}`}>
                    {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(entry.deltaPct)}%
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
