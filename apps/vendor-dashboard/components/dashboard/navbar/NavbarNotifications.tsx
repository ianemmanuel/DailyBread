'use client'

import { Bell, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@repo/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu'
import { cn } from '@repo/ui/lib/utils'

const notifications = [
  {
    id: 1,
    title: 'New order received',
    description: 'Order #1234 — Chicken Rice Bowl',
    time: '2 min ago',
    unread: true,
    type: 'order' as const,
  },
  {
    id: 2,
    title: 'New meal plan subscriber',
    description: 'Grace Muthoni subscribed to Weekly Plan',
    time: '15 min ago',
    unread: true,
    type: 'subscription' as const,
  },
  {
    id: 3,
    title: 'Payment settled',
    description: 'KSh 12,450 deposited to your account',
    time: '1 hr ago',
    unread: false,
    type: 'payment' as const,
  },
  {
    id: 4,
    title: 'Delivery completed',
    description: 'Batch #42 — 8 orders delivered',
    time: '3 hr ago',
    unread: false,
    type: 'delivery' as const,
  },
]

const typeBadge: Record<string, string> = {
  order:        'bg-blue-50 text-blue-600',
  subscription: 'bg-primary/8 text-primary',
  payment:      'bg-emerald-50 text-emerald-700',
  delivery:     'bg-amber-50 text-amber-700',
}

const NavbarNotifications = () => {
  const unreadCount = notifications.filter((n) => n.unread).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            <>
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary opacity-75 animate-ping" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0 shadow-lg">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {unreadCount} new
            </span>
          )}
        </div>

        {/* List */}
        <div className="max-h-[400px] overflow-y-auto">
          {notifications.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className={cn(
                'flex cursor-pointer flex-col items-start gap-0.5 border-b border-border/40 px-4 py-3 last:border-b-0 focus:bg-secondary/60',
                n.unread && 'bg-primary/4'
              )}
            >
              <div className="flex w-full items-start justify-between gap-2">
                <p className={cn(
                  'text-sm leading-snug',
                  n.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'
                )}>
                  {n.title}
                </p>
                {n.unread && (
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">{n.description}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground/60">{n.time}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', typeBadge[n.type])}>
                  {n.type}
                </span>
              </div>
            </DropdownMenuItem>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-border/60 p-2">
          <Link
            href="/dashboard/notifications"
            className="flex w-full items-center justify-center gap-1 rounded-md py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
          >
            View all
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default NavbarNotifications