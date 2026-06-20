"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import type { CountrySummaryResult } from "@/types/geography.types"

// ─── Countries by Region ──────────────────────────────────────

function deriveRegion(code: string): string {
  const eastAfrica  = ["KE", "UG", "TZ", "RW", "ET", "BI", "SS", "DJ", "ER", "SO", "MW", "ZM", "MZ"]
  const westAfrica  = ["NG", "GH", "SN", "CI", "CM", "BJ", "TG", "BF", "ML", "NE", "MR", "SL", "LR", "GN"]
  const southAfrica = ["ZA", "NA", "BW", "LS", "SZ", "ZW", "AO"]
  const northAfrica = ["EG", "MA", "DZ", "TN", "LY", "SD"]
  const middleEast  = ["AE", "SA", "QA", "KW", "BH", "OM", "JO", "LB"]
  const c = code.toUpperCase()
  if (eastAfrica.includes(c))  return "East Africa"
  if (westAfrica.includes(c))  return "West Africa"
  if (southAfrica.includes(c)) return "Southern Africa"
  if (northAfrica.includes(c)) return "North Africa"
  if (middleEast.includes(c))  return "Middle East"
  return "Other"
}

const REGION_COLORS: Record<string, string> = {
  "East Africa":     "var(--chart-1)",
  "West Africa":     "var(--chart-2)",
  "Southern Africa": "var(--chart-3)",
  "North Africa":    "var(--chart-4)",
  "Middle East":     "var(--chart-5)",
  "Other":           "var(--muted-foreground)",
}

interface CountriesByRegionProps {
  countries: CountrySummaryResult[]
}

export function CountriesByRegion({ countries }: CountriesByRegionProps) {
  const regionMap: Record<string, number> = {}
  for (const c of countries) {
    const region = deriveRegion(c.code)
    regionMap[region] = (regionMap[region] ?? 0) + 1
  }

  const data = Object.entries(regionMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }))

  const total = countries.length

  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
    >
      <h3
        className="mb-3 text-sm font-semibold"
        style={{ color: "var(--foreground)" }}
      >
        Countries by Region
      </h3>

      <div className="flex items-center gap-4">
        {/* Donut chart */}
        <div className="relative h-[120px] w-[120px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={56}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={REGION_COLORS[entry.name] ?? "var(--muted-foreground)"}
                  />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]!
                  return (
                    <div
                      className="rounded-lg border px-2.5 py-2 text-xs shadow-lg"
                      style={{
                        backgroundColor: "var(--popover)",
                        borderColor:     "var(--border)",
                        color:           "var(--foreground)",
                      }}
                    >
                      <p className="font-medium">{d.name}</p>
                      <p style={{ color: "var(--muted-foreground)" }}>
                        {d.value} {d.value === 1 ? "country" : "countries"}
                      </p>
                    </div>
                  )
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="font-display text-xl font-bold leading-none tabular-nums"
              style={{ color: "var(--foreground)" }}
            >
              {total}
            </span>
            <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
              Total
            </span>
          </div>
        </div>

        {/* Legend */}
        <ul className="flex flex-col gap-1.5">
          {data.map(({ name, value }) => (
            <li key={name} className="flex items-center justify-between gap-8">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: REGION_COLORS[name] ?? "var(--muted-foreground)" }}
                />
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-semibold tabular-nums"
                  style={{ color: "var(--foreground)" }}
                >
                  {value}
                </span>
                <span className="text-[11px] tabular-nums" style={{ color: "var(--muted-foreground)" }}>
                  ({Math.round((value / total) * 100)}%)
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}


// ─── Country Health Summary ───────────────────────────────────

interface HealthCategory {
  label:       string
  count:       number
  percentage:  number
  color:       string
  bgColor:     string
}

interface CountryHealthSummaryProps {
  countries: CountrySummaryResult[]
}

export function CountryHealthSummary({ countries }: CountryHealthSummaryProps) {
  // Derive health from city count — countries with 0 cities need attention,
  // countries with 1-2 cities are at risk, rest healthy.
  // Replace with real health data when backend exposes it.
  const total = countries.length
  const needsAttention = countries.filter((c) => c._count.cities === 0).length
  const atRisk         = countries.filter((c) => c._count.cities === 1).length
  const healthy        = total - needsAttention - atRisk

  const categories: HealthCategory[] = [
    {
      label:      "Healthy",
      count:      healthy,
      percentage: total > 0 ? Math.round((healthy / total) * 100) : 0,
      color:      "var(--success)",
      bgColor:    "var(--success-bg)",
    },
    {
      label:      "At Risk",
      count:      atRisk,
      percentage: total > 0 ? Math.round((atRisk / total) * 100) : 0,
      color:      "var(--warning)",
      bgColor:    "var(--warning-bg)",
    },
    {
      label:      "Needs Attention",
      count:      needsAttention,
      percentage: total > 0 ? Math.round((needsAttention / total) * 100) : 0,
      color:      "var(--destructive)",
      bgColor:    "var(--destructive-bg)",
    },
  ]

  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
    >
      <h3
        className="mb-3 text-sm font-semibold"
        style={{ color: "var(--foreground)" }}
      >
        Country Health Summary
      </h3>

      <div className="flex flex-col gap-3">
        {categories.map(({ label, count, percentage, color, bgColor }) => (
          <div key={label} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs" style={{ color: "var(--foreground)" }}>
                  {label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-semibold tabular-nums"
                  style={{ color: "var(--foreground)" }}
                >
                  {count}
                </span>
                <span className="text-[11px] tabular-nums" style={{ color: "var(--muted-foreground)" }}>
                  {percentage}%
                </span>
              </div>
            </div>
            {/* Progress bar */}
            <div
              className="h-1.5 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: bgColor }}
            >
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width:           `${percentage}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


// ─── Top Countries by Vendors ─────────────────────────────────

interface TopCountriesByVendorsProps {
  countries: CountrySummaryResult[]
}

export function TopCountriesByVendors({ countries }: TopCountriesByVendorsProps) {
  const sorted = [...countries]
    .sort((a, b) => b._count.vendors - a._count.vendors)
    .slice(0, 5)

  const max = sorted[0]?._count.vendors ?? 1

  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--foreground)" }}
        >
          Top Countries by Vendors
        </h3>
        <Link
          href="/vendors"
          className="flex items-center gap-1 text-[11px] font-medium transition-colors duration-150"
          style={{ color: "var(--primary)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--primary-hover)"
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--primary)"
          }}
        >
          View full report
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <ol className="flex flex-col gap-2.5">
        {sorted.map((country, i) => (
          <li key={country.id} className="flex items-center gap-3">
            <span
              className="shrink-0 w-4 text-xs font-bold tabular-nums text-right"
              style={{ color: "var(--muted-foreground)" }}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between">
                <span
                  className="text-xs font-semibold truncate"
                  style={{ color: "var(--foreground)" }}
                >
                  {country.name}
                </span>
                <span
                  className="shrink-0 text-xs font-semibold tabular-nums ml-2"
                  style={{ color: "var(--foreground)" }}
                >
                  {country._count.vendors.toLocaleString()}
                </span>
              </div>
              <div
                className="h-1 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: "var(--muted)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width:           `${Math.round((country._count.vendors / max) * 100)}%`,
                    backgroundColor: "var(--primary)",
                  }}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}