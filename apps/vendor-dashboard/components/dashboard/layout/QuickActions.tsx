'use client'

import Link from 'next/link'
import { Utensils, Calendar, Tag, Cake, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@repo/ui/components/card'
import { cn } from '@repo/ui/lib/utils'

const quickActions = [
  {
    title: 'New Meal',
    description: 'Add to your menu',
    icon: Utensils,
    href: '/dashboard/menu/create',
    iconClass: 'bg-primary text-primary-foreground',
    arrowClass: 'group-hover:text-primary',
  },
  {
    title: 'New Meal Plan',
    description: 'Create a subscription',
    icon: Calendar,
    href: '/dashboard/meal-plans/create',
    iconClass: 'bg-blue-500/10 text-blue-500',
    arrowClass: 'group-hover:text-blue-500',
  },
  {
    title: 'Add Discount',
    description: 'Set a promo or coupon',
    icon: Tag,
    href: '/dashboard/discounts/create',
    iconClass: 'bg-emerald-500/10 text-emerald-600',
    arrowClass: 'group-hover:text-emerald-600',
  },
  {
    title: 'Add Bakery Item',
    description: 'Fresh bread & pastries',
    icon: Cake,
    href: '/dashboard/menu/bakery/create',
    iconClass: 'bg-secondary text-secondary-foreground',
    arrowClass: 'group-hover:text-foreground',
  },
]

export function QuickActions() {
  return (
    <Card className="dash-card border-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
        <CardDescription className="text-sm">Jump straight into creating</CardDescription>
      </CardHeader>

      <CardContent className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
        {quickActions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.title}
              href={action.href}
              className="quick-action-tile group"
            >
              <div className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                action.iconClass
              )}>
                <Icon className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{action.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{action.description}</p>
              </div>

              <ArrowRight className={cn(
                'h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-all duration-200 group-hover:translate-x-0.5',
                action.arrowClass
              )} />
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}