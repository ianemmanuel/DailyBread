import Link from 'next/link'
import { Card, CardContent } from '@repo/ui/components/card'
import {
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Users,
  CalendarDays,
  Banknote,
} from 'lucide-react'
import { cn } from '@repo/ui/lib/utils'

const stats = [
  {
    id: 1,
    title: 'Revenue This Month',
    value: 'KSh 84,200',
    change: '+24%',
    trend: 'up' as const,
    note: 'vs last month',
    icon: Banknote,
    href: '/dashboard/analytics',
  },
  {
    id: 2,
    title: 'Active Orders',
    value: '142',
    change: '+12',
    trend: 'up' as const,
    note: 'since yesterday',
    icon: ShoppingBag,
    href: '/dashboard/orders',
  },
  {
    id: 3,
    title: 'Meal Subscribers',
    value: '38',
    change: '+3',
    trend: 'up' as const,
    note: 'new this week',
    icon: CalendarDays,
    href: '/dashboard/subscriptions',
  },
  {
    id: 4,
    title: 'Repeat Customers',
    value: '61%',
    change: '-4%',
    trend: 'down' as const,
    note: 'vs last month',
    icon: Users,
    href: '/dashboard/analytics',
  },
]

// Server component — no client bundle cost
export function StatsCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        const isUp = stat.trend === 'up'

        return (
          <Link key={stat.id} href={stat.href}>
            <Card className="group border-border/60 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="p-5">

                {/* Top row — icon + trend badge */}
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/8">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
                      isUp
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-red-200 bg-red-50 text-red-600'
                    )}
                  >
                    {isUp
                      ? <TrendingUp className="h-3 w-3" />
                      : <TrendingDown className="h-3 w-3" />
                    }
                    {stat.change}
                  </div>
                </div>

                {/* Value */}
                <div className="mt-4">
                  <p className="text-2xl font-bold tracking-tight text-foreground">
                    {stat.value}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                    {stat.title}
                  </p>
                </div>

                {/* Note */}
                <div className="mt-4 border-t border-border/40 pt-3">
                  <p className="text-xs text-muted-foreground/70">{stat.note}</p>
                </div>

              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}