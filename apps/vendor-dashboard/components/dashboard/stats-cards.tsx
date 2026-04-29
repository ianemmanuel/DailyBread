import Link from 'next/link'
import { CardContent } from '@repo/ui/components/card'
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
    // Which chart-color glow to use on the icon bubble
    iconColor: 'bg-primary/10 text-primary',
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
    iconColor: 'bg-blue-500/10 text-blue-500',
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
    iconColor: 'bg-emerald-500/10 text-emerald-500',
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
    iconColor: 'bg-violet-500/10 text-violet-500',
  },
]

export function StatsCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => {
        const Icon = stat.icon
        const isUp = stat.trend === 'up'

        return (
          <Link
            key={stat.id}
            href={stat.href}
            className="stat-card fade-up group block"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            {/* Subtle top-corner glow */}
            <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full bg-primary/6 blur-2xl" />

            <CardContent className="relative p-5">

              {/* Top row — icon + trend badge */}
              <div className="flex items-start justify-between">
                <div className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl',
                  stat.iconColor
                )}>
                  <Icon className="h-5 w-5" />
                </div>

                <div className={cn(
                  'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
                  isUp
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-400'
                    : 'border-red-200 bg-red-50 text-red-600 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400'
                )}>
                  {isUp
                    ? <TrendingUp className="h-3 w-3" />
                    : <TrendingDown className="h-3 w-3" />
                  }
                  {stat.change}
                </div>
              </div>

              {/* Value + label */}
              <div className="mt-4">
                <p className="text-2xl font-bold tracking-tight text-foreground">
                  {stat.value}
                </p>
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                  {stat.title}
                </p>
              </div>

              {/* Footer note */}
              <div className="mt-4 border-t border-border/40 pt-3">
                <p className="text-xs text-muted-foreground/70">{stat.note}</p>
              </div>

            </CardContent>
          </Link>
        )
      })}
    </div>
  )
}