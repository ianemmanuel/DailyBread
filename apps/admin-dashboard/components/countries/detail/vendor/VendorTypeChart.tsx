"use client"

import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
} from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@repo/ui/components/chart"

interface Props {
  metrics?: {
    type: string
    count: number
  }[]
}

const chartConfig = {
  count: {
    label: "Vendors",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

export default function VendorTypeChart({
  metrics,
}: Props) {
  if (!metrics?.length) {
    return (
      <div
        className="rounded-xl border p-5"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <h3 className="font-medium">
          Vendor Distribution
        </h3>

        <p
          className="mt-2 text-sm"
          style={{
            color: "var(--muted-foreground)",
          }}
        >
          Vendor category statistics are not available for this country yet.
        </p>
      </div>
    )
  }

  const chartData = metrics.map((item) => ({
    type: item.type,
    count: Number(item.count),
  }))

  const totalVendors = chartData.reduce(
    (sum, item) => sum + item.count,
    0,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Vendor Distribution
        </CardTitle>

        <CardDescription>
          Breakdown of vendors by business category
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="min-h-[300px] w-full"
        >
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            margin={{
              left: -20,
            }}
          >
            <XAxis
              type="number"
              dataKey="count"
              hide
            />

            <YAxis
              dataKey="type"
              type="category"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              width={150}
            />

            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent hideLabel />
              }
            />

            <Bar
              dataKey="count"
              fill="var(--color-count)"
              radius={5}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>

      <CardFooter>
        <p
          className="text-sm"
          style={{
            color: "var(--muted-foreground)",
          }}
        >
          {totalVendors.toLocaleString()} vendors across{" "}
          {chartData.length} business categories.
        </p>
      </CardFooter>
    </Card>
  )
}