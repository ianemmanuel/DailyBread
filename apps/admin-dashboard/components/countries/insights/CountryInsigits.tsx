/**
 * CountryInsights.tsx
 *
 * Right-column insights panel — health summary and GMV ranking.
 * The region donut chart has moved to page level (RegionDonutCard)
 * so it renders full-width between the KPI strip and the two-column body.
 *
 * Health and GMV data are static placeholders until those backend
 * endpoints exist. No permission checks — RBAC will be added later.
 */

import Link from "next/link"
import { Button } from "@repo/ui/components/button"
import { cn } from "@repo/ui/lib/utils"

/* ── Sub-component ────────────────────────────────────────── */

function SectionCard({
  title,
  children,
  className,
}: {
  title:      string
  children:   React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card", className)}>
      <div className="border-b border-border px-5 py-3.5">
        <h3 className="font-display text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

/* ── Static data — replace with live endpoints when ready ─── */

const HEALTH_CATEGORIES = [
  { label: "Healthy",         count: 8, percent: 66.7, barClass: "bg-success",     dotClass: "bg-success"     },
  { label: "At Risk",         count: 2, percent: 16.7, barClass: "bg-warning",     dotClass: "bg-warning"     },
  { label: "Needs Attention", count: 2, percent: 16.7, barClass: "bg-destructive", dotClass: "bg-destructive" },
]

const TOP_COUNTRIES = [
  { rank: 1, name: "Kenya",    gmv: "KES 64.2M", width: 100  },
  { rank: 2, name: "Uganda",   gmv: "KES 22.8M", width: 35.6 },
  { rank: 3, name: "Tanzania", gmv: "KES 17.6M", width: 27.4 },
  { rank: 4, name: "Rwanda",   gmv: "KES 9.8M",  width: 15.3 },
  { rank: 5, name: "Ghana",    gmv: "KES 7.9M",  width: 12.3 },
]

/* ── Main export ──────────────────────────────────────────── */

export function CountryInsights() {
  return (
    <div className="flex flex-col gap-4">

      {/* Country Health Summary */}
      <SectionCard title="Country Health Summary">
        <div className="flex flex-col gap-4">
          {HEALTH_CATEGORIES.map((h) => (
            <div key={h.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", h.dotClass)} />
                  <span className="text-muted-foreground">{h.label}</span>
                </div>
                <div className="flex items-center gap-2 tabular-nums">
                  <span className="font-semibold text-foreground">{h.count}</span>
                  <span className="text-muted-foreground">{h.percent.toFixed(1)}%</span>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", h.barClass)}
                  style={{ width: `${h.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Top Countries by GMV */}
      <SectionCard title="Top Countries by GMV (30d)">
        <div className="flex flex-col gap-3">
          {TOP_COUNTRIES.map((c) => (
            <div key={c.rank} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-3 tabular-nums text-muted-foreground">{c.rank}</span>
                  <span className="font-medium text-foreground">{c.name}</span>
                </div>
                <span className="tabular-nums font-semibold text-foreground">{c.gmv}</span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${c.width}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <Button variant="outline" size="sm" className="h-8 w-full text-xs" asChild>
            <Link href="/reports/countries">View full report</Link>
          </Button>
        </div>
      </SectionCard>

    </div>
  )
}