"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { TrendingUp } from "lucide-react"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { EmptyState } from "@/components/shared/EmptyState"
import { formatMockCurrency } from "@/lib/mock/country-revenue"
import type { MockRevenuePoint } from "@/lib/mock/country-revenue"

interface Props {
  points: MockRevenuePoint[]
  scopeLabel: string
}

const chartConfig = {
  value: { label: "Revenue", color: "var(--primary)" },
} satisfies ChartConfig

/**
 * STATIC — no Orders/Payments model exists yet, see
 * lib/mock/vendor-type-revenue.ts. Single-series trend, so one hue
 * (primary) and no legend, same convention as components/countries/RevenueChart.tsx.
 */
export function VendorCategoryRevenueChart({ points, scopeLabel }: Props) {
  if (points.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No revenue data"
        description="Revenue trend will appear here once available."
      />
    )
  }

  return (
    <div className="admin-card">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Revenue Trend — Last 12 Months</h2>
          <p className="text-xs text-muted-foreground">Illustrative figures — {scopeLabel}. Replace once Orders/Payments ships.</p>
        </div>
        <div className="icon-badge icon-badge-primary h-9 w-9 shrink-0">
          <TrendingUp className="h-4 w-4" />
        </div>
      </div>

      <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
        <AreaChart data={points} margin={{ left: 4, right: 4, top: 4 }}>
          <defs>
            <linearGradient id="vendorCategoryRevenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={64}
            tickFormatter={(value: number) => formatMockCurrency(value)}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--border)" }}
            content={<ChartTooltipContent labelKey="label" formatter={(value) => formatMockCurrency(Number(value))} />}
          />
          <Area
            dataKey="value"
            type="monotone"
            fill="url(#vendorCategoryRevenueFill)"
            stroke="var(--color-value)"
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}
