"use client"

import Link from "next/link"
import {
  CheckCircle2,
  MapPin,
  Store,
  ShieldAlert,
} from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { cn } from "@repo/ui/lib/utils"

/* ── Types ────────────────────────────────────────────────── */

interface RegionBreakdown {
  name:     string
  count:    number
  percent:  number
  /** Raw SVG stroke color — explicit oklch so it works in both themes */
  stroke:   string
  /** Tailwind bg- class for the legend dot */
  dotBg:    string
}

interface HealthCategory {
  label:    string
  count:    number
  percent:  number
  barClass: string
  dotBg:    string
}

interface TopCountry {
  rank:  number
  name:  string
  gmv:   string
  width: number
}

/* ── Static mock data ─────────────────────────────────────── */

const REGION_BREAKDOWN: RegionBreakdown[] = [
  {
    name: "East Africa",
    count: 7, percent: 58,
    // primary brand color — same in both themes
    stroke: "var(--primary)",
    dotBg:  "bg-primary",
  },
  {
    name: "West Africa",
    count: 3, percent: 25,
    // explicit oklch — not reliant on --chart-2 being defined in light mode
    stroke: "oklch(0.640 0.130 240)",
    dotBg:  "bg-[oklch(0.640_0.130_240)]",
  },
  {
    name: "Southern Africa",
    count: 2, percent: 17,
    stroke: "oklch(0.580 0.150 148)",
    dotBg:  "bg-[oklch(0.580_0.150_148)]",
  },
]

const HEALTH_CATEGORIES: HealthCategory[] = [
  { label: "Healthy",         count: 8, percent: 66.7, barClass: "bg-success",     dotBg: "bg-success"     },
  { label: "At Risk",         count: 2, percent: 16.7, barClass: "bg-warning",     dotBg: "bg-warning"     },
  { label: "Needs Attention", count: 2, percent: 16.7, barClass: "bg-destructive", dotBg: "bg-destructive" },
]

const TOP_COUNTRIES: TopCountry[] = [
  { rank: 1, name: "Kenya",    gmv: "KES 64.2M", width: 100  },
  { rank: 2, name: "Uganda",   gmv: "KES 22.8M", width: 35.6 },
  { rank: 3, name: "Tanzania", gmv: "KES 17.6M", width: 27.4 },
  { rank: 4, name: "Rwanda",   gmv: "KES 9.8M",  width: 15.3 },
  { rank: 5, name: "Ghana",    gmv: "KES 7.9M",  width: 12.3 },
]

/* ── Sub-components ───────────────────────────────────────── */

function SectionCard({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
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

/**
 * DonutChart
 * Pure SVG — no Recharts. Uses explicit stroke colors (not CSS vars for
 * chart-2/3) so both light and dark themes render correctly.
 */
function DonutChart({ segments }: { segments: RegionBreakdown[] }) {
  const size = 96
  const r    = 36
  const cx   = size / 2
  const cy   = size / 2
  const circ = 2 * Math.PI * r

  // Small gap between segments so they visually separate
  const GAP_DEG  = 2
  const GAP_ARC  = (GAP_DEG / 360) * circ
  const total    = segments.reduce((s, seg) => s + seg.percent, 0)

  let offset = 0
  const arcs = segments.map((seg) => {
    const fraction = seg.percent / total
    const dash     = fraction * circ - GAP_ARC
    const gap      = circ - dash
    const arc = (
      <circle
        key={seg.name}
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={seg.stroke}
        strokeWidth={15}
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={-(offset + GAP_ARC / 2)}
        strokeLinecap="butt"
      />
    )
    offset += fraction * circ
    return arc
  })

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90"
      aria-hidden="true"
    >
      {/* Track */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth={15}
      />
      {arcs}

      {/* Centre label — counter-rotate with CSS so text reads normally */}
      <g style={{ transform: `rotate(90deg)`, transformOrigin: `${cx}px ${cy}px` }}>
        <text
          x={cx} y={cy - 6}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--foreground)"
          fontSize="18"
          fontWeight="700"
          fontFamily="var(--font-display, sans-serif)"
        >
          12
        </text>
        <text
          x={cx} y={cy + 10}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--muted-foreground)"
          fontSize="10"
        >
          Total
        </text>
      </g>
    </svg>
  )
}

/* ── Main export ──────────────────────────────────────────── */

export function CountryInsights() {
  return (
    <div className="flex flex-col gap-4">
      {/* Countries by Region */}
      <SectionCard title="Countries by Region">
        <div className="flex items-center gap-5">
          <div className="shrink-0">
            <DonutChart segments={REGION_BREAKDOWN} />
          </div>
          <div className="flex flex-col gap-2.5 min-w-0">
            {REGION_BREAKDOWN.map((r) => (
              <div key={r.name} className="flex items-center gap-2 text-xs">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", r.dotBg)} />
                <span className="truncate text-muted-foreground">{r.name}</span>
                <span className="ml-auto shrink-0 tabular-nums font-semibold text-foreground">
                  {r.count}
                </span>
                <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">
                  ({r.percent}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Country Health Summary */}
      <SectionCard title="Country Health Summary">
        <div className="flex flex-col gap-4">
          {HEALTH_CATEGORIES.map((h) => (
            <div key={h.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", h.dotBg)} />
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
          <Button variant="outline" className="h-8 w-full text-xs" asChild>
            <Link href="/reports/countries">View full report</Link>
          </Button>
        </div>
      </SectionCard>
    </div>
  )
}