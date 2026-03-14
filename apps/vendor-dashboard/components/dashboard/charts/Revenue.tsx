'use client'

import * as React from 'react'
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts'
import { TrendingUp, TrendingDown, Banknote } from 'lucide-react'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@repo/ui/components/card'
import {
  ChartConfig, ChartContainer, ChartLegend, ChartLegendContent,
  ChartTooltip, ChartTooltipContent,
} from '@repo/ui/components/chart'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@repo/ui/components/select'

const chartData = [
  { date: '2024-01-01', revenue: 4000,  orders: 2400 },
  { date: '2024-02-01', revenue: 3000,  orders: 1398 },
  { date: '2024-03-01', revenue: 5200,  orders: 3800 },
  { date: '2024-04-01', revenue: 2780,  orders: 3908 },
  { date: '2024-05-01', revenue: 3890,  orders: 4800 },
  { date: '2024-06-01', revenue: 4390,  orders: 3800 },
  { date: '2024-07-01', revenue: 3490,  orders: 4300 },
  { date: '2024-08-01', revenue: 4200,  orders: 5200 },
  { date: '2024-09-01', revenue: 3800,  orders: 4100 },
  { date: '2024-10-01', revenue: 4500,  orders: 4800 },
  { date: '2024-11-01', revenue: 5200,  orders: 5400 },
  { date: '2024-12-01', revenue: 6100,  orders: 6200 },
]

const chartConfig = {
  revenue: { label: 'Revenue (KSh)', color: 'var(--chart-2)' },
  orders:  { label: 'Orders',        color: 'var(--chart-1)' },
} satisfies ChartConfig

export function RevenueChart() {
  const [timeRange, setTimeRange] = React.useState('12m')

  const filteredData = chartData.filter((item) => {
    const date = new Date(item.date)
    const ref = new Date('2024-12-01')
    ref.setMonth(ref.getMonth() - (timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12))
    return date >= ref
  })

  const totalRevenue = filteredData.reduce((s, i) => s + i.revenue, 0)
  const last = filteredData.at(-1)?.revenue ?? 0
  const prev = filteredData.at(-2)?.revenue ?? 0
  const growth = prev > 0 ? ((last - prev) / prev) * 100 : 0
  const isUp = growth >= 0

  return (
    // min-w-0: critical — prevents recharts from overflowing flex parent
    <Card className="min-w-0 border-border/60 shadow-sm">
      <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Banknote className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-base font-semibold">Revenue & Orders</CardTitle>
          </div>
          <CardDescription className="pl-11 text-sm">Monthly trends</CardDescription>
          <div className="flex items-baseline gap-2.5 pl-11 pt-1">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              KSh {(totalRevenue / 1000).toFixed(1)}k
            </span>
            <span className={`flex items-center gap-1 text-sm font-semibold ${isUp ? 'text-emerald-600' : 'text-destructive'}`}>
              {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {Math.abs(growth).toFixed(1)}%
            </span>
          </div>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-35 shrink-0 rounded-lg border-border/70 text-sm" aria-label="Time range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="12m">Last 12 months</SelectItem>
            <SelectItem value="6m">Last 6 months</SelectItem>
            <SelectItem value="3m">Last 3 months</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent className="px-2 pb-4 sm:px-6">
        {/* w-full + overflow-hidden on ChartContainer prevents SVG blowout */}
        <ChartContainer config={chartConfig} className="h-60 w-full sm:h-70">
          <AreaChart data={filteredData} margin={{ left: 0, right: 0 }}>
            <defs>
              <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--chart-2)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="fillOrders" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--chart-1)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" opacity={0.6} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={40}
              fontSize={11}
              tick={{ fill: 'var(--muted-foreground)' }}
              tickFormatter={(v) => new Date(v).toLocaleDateString('en-KE', { month: 'short' })}
            />
            <ChartTooltip
              cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
              content={
                <ChartTooltipContent
                  labelFormatter={(v) => new Date(v).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}
                  indicator="dot"
                />
              }
            />
            <Area dataKey="revenue" type="natural" fill="url(#fillRevenue)" stroke="var(--chart-2)" strokeWidth={2} />
            <Area dataKey="orders"  type="natural" fill="url(#fillOrders)"  stroke="var(--chart-1)" strokeWidth={2} />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}