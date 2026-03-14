'use client'

import Link from 'next/link'
import { Utensils, Calendar, Tag, Cake, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@repo/ui/components/card'

const quickActions = [
  {
    title: 'New Meal',
    description: 'Add to your menu',
    icon: Utensils,
    href: '/dashboard/menu/create',
    // terracotta — primary brand action
    iconClass: 'bg-primary text-primary-foreground',
    hoverClass: 'hover:border-primary/30 hover:bg-primary/4',
    accentClass: 'text-primary',
  },
  {
    title: 'New Meal Plan',
    description: 'Create a subscription',
    icon: Calendar,
    href: '/dashboard/meal-plans/create',
    // warm gold accent
    iconClass: 'bg-accent/80 text-accent-foreground',
    hoverClass: 'hover:border-accent/40 hover:bg-accent/8',
    accentClass: 'text-accent-foreground',
  },
  {
    title: 'Add Discount',
    description: 'Set a promo or coupon',
    icon: Tag,
    href: '/dashboard/discounts/create',
    // deep chocolate surface
    iconClass: 'bg-deep text-deep-foreground',
    hoverClass: 'hover:border-deep/20 hover:bg-deep/5',
    accentClass: 'text-deep',
  },
  {
    title: 'Add Bakery Item',
    description: 'Fresh bread & pastries',
    icon: Cake,
    href: '/dashboard/menu/bakery/create',
    // muted warm — softer action
    iconClass: 'bg-secondary text-secondary-foreground',
    hoverClass: 'hover:border-border hover:bg-secondary/70',
    accentClass: 'text-foreground',
  },
]

export function QuickActions() {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold text-foreground">Quick Actions</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Jump straight into creating
        </CardDescription>
      </CardHeader>

      <CardContent className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {quickActions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.title}
              href={action.href}
              className={`
                group flex items-center gap-3.5 rounded-xl border border-border/60 bg-white
                p-3.5 transition-all duration-150
                ${action.hoverClass}
                hover:shadow-sm
              `}
            >
              {/* Icon container — each action has a distinct surface */}
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${action.iconClass}`}>
                <Icon className="h-4 w-4" />
              </div>

              {/* Text */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight text-foreground">
                  {action.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {action.description}
                </p>
              </div>

              {/* Arrow — subtle, appears on hover */}
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground/70" />
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}