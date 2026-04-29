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
  order:        'badge-info',
  subscription: 'badge-primary',
  payment:      'badge-success',
  delivery:     'badge-warning',
}

const NavbarNotifications = () => {
  const unreadCount = notifications.filter((n) => n.unread).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            <>
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary opacity-70 animate-ping" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="
          w-96 rounded-2xl p-0 shadow-xl
          bg-card dark:bg-card
          border border-border/60
          [&]:!bg-card
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Notifications</p>
          </div>
          {unreadCount > 0 && (
            <span className="badge-primary">{unreadCount} new</span>
          )}
        </div>

        {/* List */}
        <div className="max-h-[420px] overflow-y-auto scroll-hidden">
          {notifications.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className={cn(
                `
                  flex cursor-pointer flex-col items-start
                  gap-1.5 px-3 py-2.5
                  rounded-none
                  border-b border-border/40 last:border-b-0
                  focus:bg-secondary/60
                  transition-colors duration-150
                `,
                n.unread && 'bg-primary/[0.04] dark:bg-primary/[0.08]'
              )}
            >
              {/* Title row */}
              <div className="flex w-full items-start justify-between gap-3">
                <p className={cn(
                  'text-sm leading-snug',
                  n.unread
                    ? 'font-semibold text-foreground'
                    : 'font-medium text-foreground/80'
                )}>
                  {n.title}
                </p>
                {n.unread && (
                  <span className="relative mt-1 flex h-1.5 w-1.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                  </span>
                )}
              </div>

              {/* Description */}
              <p className="text-xs leading-relaxed text-muted-foreground">
                {n.description}
              </p>

              {/* Meta row */}
              <div className="flex items-center gap-2.5 pt-0.5">
                <span className={typeBadge[n.type]}>{n.type}</span>
                <span className="text-[11px] text-muted-foreground/50">{n.time}</span>
              </div>
            </DropdownMenuItem>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-border/60 px-5 py-3">
          <Link
            href="/dashboard/notifications"
            className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/6"
          >
            View all notifications
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default NavbarNotifications