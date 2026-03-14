'use client'

import { TrendingUp, Users } from 'lucide-react'
import { Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from 'recharts'
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@repo/ui/components/card'
import { ChartConfig, ChartContainer } from '@repo/ui/components/chart'

const chartData = [{ metric: 'adoption', value: 68, fill: 'var(--chart-3)' }]

const chartConfig = {
  value:    { label: 'Meal Plan Adoption' },
  adoption: { label: 'Adoption Rate', color: 'var(--chart-3)' },
} satisfies ChartConfig

export function MealPlanPerformance() {
  return (
    <Card className="flex min-w-0 flex-col border-border/60 shadow-sm">
      <CardHeader className="items-center pb-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">Meal Plans</CardTitle>
        </div>
        <CardDescription className="pt-1 text-center text-sm">
          Subscription growth &amp; engagement
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 pb-0">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square w-full max-h-55">
          <RadialBarChart data={chartData} endAngle={180} innerRadius={70} outerRadius={130}>
            <PolarGrid
              gridType="circle"
              radialLines={false}
              stroke="none"
              className="first:fill-muted last:fill-background"
              polarRadius={[84, 72]}
            />
            <RadialBar dataKey="value" background cornerRadius={8} strokeWidth={0} />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-3xl font-bold">
                          {chartData[0].value}%
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 24} className="fill-muted-foreground text-sm">
                          Adoption
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      </CardContent>

      <CardFooter className="flex-col gap-1.5 pb-5 text-sm">
        <div className="flex items-center gap-2 font-medium leading-none text-emerald-600">
          <TrendingUp className="h-4 w-4" />
          +24% growth this quarter
        </div>
        <div className="text-center leading-none text-muted-foreground">
          2,340 active subscribers
        </div>
      </CardFooter>
    </Card>
  )
}