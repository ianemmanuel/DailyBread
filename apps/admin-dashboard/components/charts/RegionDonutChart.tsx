/**
 * RegionDonutCard.tsx
 *
 * "Countries by Region" donut chart — rendered at page level alongside
 * the KPI strip, before the two-column body.
 *
 * Uses shadcn ChartContainer + Recharts PieChart so the chart inherits
 * the project's CSS variable tokens (--chart-1 through --chart-8) in both
 * light and dark modes automatically.
 *
 * Receives live data from page.tsx — no internal fetch.
 */

"use client"

import * as React from "react"
import { Pie, PieChart, Label } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import type { RegionBreakdown } from "@repo/types/admin-app"

/* ── Chart color keys ────────────────────────────────────────
   Up to 7 named regions + 1 ungrouped slot.
   Keys must be simple identifiers — used as CSS var names via shadcn.
*/
const COLOR_KEYS = [
  "chart1", "chart2", "chart3", "chart4",
  "chart5", "chart6", "chart7", "chart8",
] as const

type ColorKey = typeof COLOR_KEYS[number]

/* Maps slot index → CSS variable. Index 7 (chart8) = slate = ungrouped. */
const COLOR_MAP: Record<ColorKey, string> = {
  chart1: "var(--chart-1)",
  chart2: "var(--chart-2)",
  chart3: "var(--chart-3)",
  chart4: "var(--chart-4)",
  chart5: "var(--chart-5)",
  chart6: "var(--chart-6)",
  chart7: "var(--chart-7)",
  chart8: "var(--chart-8)",
}

interface RegionDonutCardProps {
  regionBreakdown: RegionBreakdown
}

export function RegionDonutCard({ regionBreakdown }: RegionDonutCardProps) {
  const { regions, ungroupedCountries, totalActive } = regionBreakdown

  /* ── Build chart data ──────────────────────────────────── */

  const chartData = [
    ...regions.map((r, idx) => ({
      name:     r.regionName,
      code:     r.regionCode,
      count:    r.countryCount,
      percent:  r.percent,
      colorKey: COLOR_KEYS[idx % (COLOR_KEYS.length - 1)] as ColorKey, // reserve last for ungrouped
      fill:     COLOR_MAP[COLOR_KEYS[idx % (COLOR_KEYS.length - 1)] as ColorKey],
    })),
    ...(ungroupedCountries > 0
      ? [{
          name:     "Ungrouped",
          code:     "—",
          count:    ungroupedCountries,
          percent:  totalActive > 0
            ? Math.round((ungroupedCountries / totalActive) * 1000) / 10
            : 0,
          colorKey: "chart8" as ColorKey,
          fill:     COLOR_MAP["chart8"],
        }]
      : []),
  ]

  /* ── Build ChartConfig (required by shadcn ChartContainer) ── */

  const chartConfig: ChartConfig = {
    count: { label: "Countries" },
    ...Object.fromEntries(
      chartData.map((d) => [
        d.name,
        { label: d.name, color: COLOR_MAP[d.colorKey] },
      ]),
    ),
  } satisfies ChartConfig

  /* ── Empty state ─────────────────────────────────────────── */

  if (totalActive === 0) return null

  const hasNoRegions = regions.length === 0 && ungroupedCountries > 0

  return (
    <div className="mb-6 rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-0 sm:flex-row">

        {/* ── Donut ──────────────────────────────────────────── */}
        <div className="flex items-center justify-center border-b border-border p-5 sm:border-b-0 sm:border-r sm:p-6">
          <ChartContainer
            config={chartConfig}
            className="h-[160px] w-[160px] shrink-0"
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, name) => (
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className="font-semibold text-foreground">{value}</span>
                        <span className="text-muted-foreground">
                          {name} ({chartData.find((d) => d.name === name)?.percent ?? 0}%)
                        </span>
                      </span>
                    )}
                  />
                }
              />
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="name"
                innerRadius={52}
                outerRadius={72}
                strokeWidth={2}
                stroke="var(--card)"
              >
                <Label
                  content={({ viewBox }) => {
                    if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground font-display text-3xl font-bold"
                        >
                          {totalActive}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy ?? 0) + 22}
                          className="fill-muted-foreground text-[11px]"
                        >
                          {totalActive === 1 ? "country" : "countries"}
                        </tspan>
                      </text>
                    )
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        </div>

        {/* ── Legend + header ───────────────────────────────── */}
        <div className="flex flex-1 flex-col justify-center gap-4 p-5 sm:p-6">
          <div>
            <h3 className="font-display text-sm font-semibold text-foreground">
              Countries by Region
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {regions.length} active region{regions.length !== 1 ? "s" : ""}
              {ungroupedCountries > 0 && `, ${ungroupedCountries} ungrouped`}
            </p>
          </div>

          {hasNoRegions ? (
            <p className="text-xs text-muted-foreground">
              No regions configured yet. Create regions and assign countries to see the breakdown.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {chartData.map((row) => (
                <div key={row.name} className="flex items-center gap-2.5 text-xs">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.fill }}
                  />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {row.name}
                  </span>
                  <span className="shrink-0 tabular-nums font-semibold text-foreground">
                    {row.count}
                  </span>
                  <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
                    {row.percent}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}