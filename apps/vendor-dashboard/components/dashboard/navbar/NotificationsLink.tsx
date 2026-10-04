'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

export const NOTIFICATIONS_HREF = '/dashboard/notifications'

/*
 * A plain link to the notifications page — no dropdown, no unread badge, no
 * fetching or polling. The vendor notification system does not exist yet, and
 * a badge with nothing behind it would be a number we invented (principle
 * 11). When notifications are real, the count belongs here, read once on the
 * server rather than polled from every page.
 */
export function NotificationsLink() {
  const active = usePathname() === NOTIFICATIONS_HREF
  return (
    <Link
      href={NOTIFICATIONS_HREF}
      aria-label="Notifications"
      aria-current={active ? 'page' : undefined}
      title="Notifications"
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors',
        'hover:bg-secondary hover:text-foreground',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        active && 'bg-secondary text-foreground',
      )}
    >
      <Bell aria-hidden className="size-[1.125rem]" />
    </Link>
  )
}
