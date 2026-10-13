"use client"

import { useId } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { TrendingUp } from "lucide-react"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { EmptyState } from "@/components/shared/EmptyState"
import { formatMockCurrency, type MockRevenuePoint } from "@/lib/mock/country-revenue"

interface Props {
  data : MockRevenuePoint[]
  /** What's being charted — "All active countries" or a single country's name. */
  label: string
}

const chartConfig = {
  value: { label: "Revenue", color: "var(--primary)" },
} satisfies ChartConfig

/**
 * STATIC — no Orders/Payments model exists yet, see lib/mock/country-revenue.ts.
 * 12-month revenue trend. Shared by the /countries home (compact) and
 * /countries/revenue (full page) — a single series, so one hue (primary)
 * and no legend, per the platform's chart conventions.
 */
export function RevenueAreaChart({ data, label }: Props) {
  const gradientId = `revenue-fill-${useId().replace(/:/g, "")}`

  if (data.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No revenue data"
        description="Revenue only tracks countries that are currently active."
      />
    )
  }

  return (
    <div className="admin-card">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Revenue — Last 12 Months</h2>
          <p className="text-xs text-muted-foreground">{label} · Illustrative figures — replace once Orders/Payments ships.</p>
        </div>
        <div className="icon-badge icon-badge-primary h-9 w-9 shrink-0">
          <TrendingUp className="h-4 w-4" />
        </div>
      </div>

      <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
        <AreaChart data={data} margin={{ left: 4, right: 4, top: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={64}
            tickFormatter={(value: number) => formatMockCurrency(value)}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
            content={<ChartTooltipContent formatter={(value) => formatMockCurrency(Number(value))} />}
          />
          <Area
            dataKey="value"
            type="monotone"
            stroke="var(--color-value)"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}
