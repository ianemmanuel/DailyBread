"use client"

import { Pie, PieChart, Cell } from "recharts"
import Link from "next/link"
import { TrendingUp, ArrowRight } from "lucide-react"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { EmptyState } from "@/components/shared/EmptyState"
import { formatMockCurrency } from "@/lib/mock/country-revenue"
import type { MockRevenueShareResult } from "@/lib/mock/vendor-type-revenue"

interface Props {
  data       : MockRevenueShareResult
  scopeLabel : string
  /** Omit when the viewer lacks FINANCE_REPORTS_READ — the destination (/finance/vendor-categories) is gated on it, so linking there for someone without it would be a dead link. */
  viewMoreHref?: string
}

const SLICE_COLORS = [
  "var(--primary)",
  "var(--info)",
  "var(--success)",
  "var(--warning)",
  "var(--destructive)",
]
const OTHERS_COLOR = "var(--muted-foreground)"

/**
 * STATIC — no Orders/Payments model exists yet (same caveat as every
 * other revenue figure in this app, see lib/mock/vendor-type-revenue.ts).
 * Same visual shape as AdoptionDonutChart on purpose — the two sit side
 * by side and should read as a pair, not two unrelated widgets.
 */
export function RevenueDonutChart({ data, scopeLabel, viewMoreHref }: Props) {
  const chartData = [
    ...data.items.map((i) => ({ name: i.vendorType.name, value: i.revenue, percentage: i.percentage })),
    ...(data.others ? [{ name: "Others", value: data.others.revenue, percentage: data.others.percentage }] : []),
  ]

  const chartConfig = Object.fromEntries(
    chartData.map((d, i) => [d.name, { label: d.name, color: i < data.items.length ? SLICE_COLORS[i % SLICE_COLORS.length] : OTHERS_COLOR }]),
  ) satisfies ChartConfig

  return (
    <div className="admin-card flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Revenue by Category</h2>
          <p className="text-xs text-muted-foreground">Illustrative — last quarter, {scopeLabel}</p>
        </div>
        <div className="icon-badge icon-badge-info h-9 w-9 shrink-0">
          <TrendingUp className="h-4 w-4" />
        </div>
      </div>

      {chartData.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No revenue data" description="Revenue share will appear here once categories are assigned." />
      ) : (
        <>
          <ChartContainer config={chartConfig} className="mx-auto aspect-auto h-[220px] w-full max-w-[280px]">
            <PieChart>
              <ChartTooltip
                content={<ChartTooltipContent hideLabel formatter={(value, name) => (
                  <span className="text-foreground">{name}: <span className="font-mono font-medium">{formatMockCurrency(Number(value))}</span></span>
                )} />}
              />
              <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} strokeWidth={2} paddingAngle={2}>
                {chartData.map((entry, index) => (
                  <Cell key={entry.name} fill={index < data.items.length ? SLICE_COLORS[index % SLICE_COLORS.length] : OTHERS_COLOR} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>

          <ul className="mt-2 space-y-1.5">
            {chartData.map((d, i) => (
              <li key={d.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: i < data.items.length ? SLICE_COLORS[i % SLICE_COLORS.length] : OTHERS_COLOR }}
                  />
                  <span className="truncate text-foreground">{d.name}</span>
                </span>
                <span className="shrink-0 font-mono text-muted-foreground">{d.percentage}%</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">Illustrative — replace once Orders/Payments ships.</p>

      {viewMoreHref && (
        <Link href={viewMoreHref} className="view-all-link mt-2 self-start">
          View revenue trend <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}
