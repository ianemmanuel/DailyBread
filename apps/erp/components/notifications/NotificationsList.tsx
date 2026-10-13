"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Bell, CheckCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import { NOTIFICATION_ICON, NOTIFICATION_ACCENT, deepLinkFor } from "./notification-meta"
import type { AdminNotification } from "@/types"

interface Props {
  notifications: AdminNotification[]
  unreadCount  : number
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function NotificationsList({ notifications, unreadCount }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [localUnread, setLocalUnread] = useState(unreadCount)

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" }).catch(() => {})
    setLocalUnread((c) => Math.max(0, c - 1))
    startTransition(() => router.refresh())
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "PATCH" }).catch(() => {})
    setLocalUnread(0)
    startTransition(() => router.refresh())
  }

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="No notifications"
        description="Nothing matches these filters — you're all caught up."
      />
    )
  }

  return (
    <div className="space-y-4">
      {localUnread > 0 && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" disabled={pending} onClick={markAllRead}>
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        </div>
      )}
      <div className="admin-card divide-y divide-border/60 p-0">
        {notifications.map((n) => {
          const href = deepLinkFor(n)
          const Icon = NOTIFICATION_ICON[n.type]
          const accent = NOTIFICATION_ACCENT[n.type]
          const content = (
            <div className={`flex items-start gap-3 px-5 py-4 ${!n.isRead ? "bg-primary/5" : ""}`}>
              <div className={`icon-badge h-9 w-9 shrink-0 ${accent}`}>
                {Icon ? <Icon className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  {!n.isRead && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</p>
              </div>
            </div>
          )

          return href ? (
            <Link key={n.id} href={href} onClick={() => !n.isRead && markRead(n.id)} className="block transition-colors hover:bg-muted/20">
              {content}
            </Link>
          ) : (
            <button
              key={n.id}
              type="button"
              onClick={() => !n.isRead && markRead(n.id)}
              className="block w-full text-left transition-colors hover:bg-muted/20"
            >
              {content}
            </button>
          )
        })}
      </div>
    </div>
  )
}
