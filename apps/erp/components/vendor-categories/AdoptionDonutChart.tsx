"use client"

import { Pie, PieChart, Cell } from "recharts"
import Link from "next/link"
import { PieChart as PieIcon, ArrowRight } from "lucide-react"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { EmptyState } from "@/components/shared/EmptyState"
import type { VendorTypeAdoptionResult } from "@/types/vendor-type.types"

interface Props {
  data       : VendorTypeAdoptionResult | null
  /** Label for the scope this chart represents — a country name, or "All Countries". */
  scopeLabel : string
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
 * Top 5 vendor categories by adoption (real VendorAccount counts, unlike
 * the sibling revenue donut which is mock — no Orders/Payments model
 * exists yet). Scope-aware via the `data` prop the page already resolved:
 * global scope passes the system-wide breakdown, country scope passes
 * that one country's breakdown — this component just renders whichever
 * it's given.
 */
export function AdoptionDonutChart({ data, scopeLabel, viewMoreHref }: Props) {
  const items = data?.items.filter((i) => i.vendorType) ?? []
  const chartData = [
    ...items.map((i) => ({ name: i.vendorType!.name, value: i.count, percentage: i.percentage })),
    ...(data?.others ? [{ name: "Others", value: data.others.count, percentage: data.others.percentage }] : []),
  ]

  const chartConfig = Object.fromEntries(
    chartData.map((d, i) => [d.name, { label: d.name, color: i < items.length ? SLICE_COLORS[i % SLICE_COLORS.length] : OTHERS_COLOR }]),
  ) satisfies ChartConfig

  return (
    <div className="admin-card flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Category Adoption</h2>
          <p className="text-xs text-muted-foreground">Top 5 categories by vendor count — {scopeLabel}</p>
        </div>
        <div className="icon-badge icon-badge-primary h-9 w-9 shrink-0">
          <PieIcon className="h-4 w-4" />
        </div>
      </div>

      {chartData.length === 0 ? (
        <EmptyState icon={PieIcon} title="No vendors yet" description="Adoption will appear here once vendors are onboarded." />
      ) : (
        <>
          <ChartContainer config={chartConfig} className="mx-auto aspect-auto h-[220px] w-full max-w-[280px]">
            <PieChart>
              <ChartTooltip
                content={<ChartTooltipContent hideLabel formatter={(value, name) => (
                  <span className="text-foreground">{name}: <span className="font-mono font-medium">{Number(value).toLocaleString()}</span></span>
                )} />}
              />
              <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} strokeWidth={2} paddingAngle={2}>
                {chartData.map((entry, index) => (
                  <Cell key={entry.name} fill={index < items.length ? SLICE_COLORS[index % SLICE_COLORS.length] : OTHERS_COLOR} />
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
                    style={{ backgroundColor: i < items.length ? SLICE_COLORS[i % SLICE_COLORS.length] : OTHERS_COLOR }}
                  />
                  <span className="truncate text-foreground">{d.name}</span>
                </span>
                <span className="shrink-0 font-mono text-muted-foreground">{d.percentage}%</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {viewMoreHref && (
        <Link href={viewMoreHref} className="view-all-link mt-4 self-start">
          View all categories <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}
