"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"

// Polled, not real-time — same "subtle glow, not a live counter" convention
// as the sidebar's compliance dot (see SidebarNav.tsx). A 60s interval is
// plenty for an in-app notification center with no push infrastructure.
const POLL_INTERVAL_MS = 60_000

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function fetchCount() {
      try {
        const res = await fetch("/api/notifications/unread-count")
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setUnreadCount(data?.data?.count ?? 0)
      } catch {
        // best-effort — a failed poll just leaves the last known count
      }
    }

    fetchCount()
    const interval = setInterval(fetchCount, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return (
    <Button asChild variant="ghost" size="icon" className="relative h-9 w-9 rounded-lg">
      <Link href="/notifications" aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}>
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary"
            aria-hidden="true"
          />
        )}
      </Link>
    </Button>
  )
}
