import type { Metadata } from "next"
import Link from "next/link"
import { Bell, ShieldAlert, Scale, Flag, MailOpen } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { NotificationsList } from "@/components/notifications/NotificationsList"
import { TablePagination } from "@/components/shared/TablePagination"
import { NOTIFICATION_CATEGORIES } from "@/components/notifications/notification-meta"
import type { AdminNotificationListResult } from "@/types"

export const metadata: Metadata = { title: "Notifications" }

const PAGE_SIZE = 25

interface PageProps {
  searchParams: Promise<{ category?: string; unread?: string; page?: string }>
}

/*
 * Robust notification center — category tabs (backed by real server-
 * computed counts, same Promise.all(pageSize=1) convention as every other
 * list page in this app), an unread-only toggle, and real pagination
 * instead of the previous "first 50, no more" fetch. Category grouping
 * and icon/deep-link resolution live in notification-meta.ts — this page
 * only ever filters by `type` (a CSV of that category's types), never
 * switches on it directly.
 */
export default async function NotificationsPage({ searchParams }: PageProps) {
  const params   = await searchParams
  const category = params.category ?? ""
  const unread   = params.unread === "true"
  const page     = params.page ?? "1"

  const activeCategory = NOTIFICATION_CATEGORIES.find((c) => c.value === category)
  const typeFilter = activeCategory ? `&type=${activeCategory.types.join(",")}` : ""

  const qsParams: Record<string, string> = { page, pageSize: String(PAGE_SIZE) }
  if (category) qsParams.category = category
  if (unread)   qsParams.unread   = "true"

  const [result, ...categoryCounts] = await Promise.all([
    adminFetch<AdminNotificationListResult>(
      `/admin/v1/notifications?page=${page}&pageSize=${PAGE_SIZE}${unread ? "&unreadOnly=true" : ""}${typeFilter}`,
      { cache: "no-store" },
    ).catch(() => null),
    ...NOTIFICATION_CATEGORIES.map((c) =>
      adminFetch<AdminNotificationListResult>(`/admin/v1/notifications?pageSize=1&unreadOnly=true&type=${c.types.join(",")}`, { cache: "no-store" })
        .catch(() => ({ total: 0 })),
    ),
  ])

  const unreadCount = result?.unreadCount ?? 0

  const statCards = [
    { label: "Unread",      value: unreadCount, icon: MailOpen,    badgeClass: "icon-badge-primary" },
    { label: "Compliance",  value: (categoryCounts[0] as { total: number }).total, icon: ShieldAlert, badgeClass: "icon-badge-warning" },
    { label: "Appeals",     value: (categoryCounts[1] as { total: number }).total, icon: Scale,       badgeClass: "icon-badge-danger" },
    { label: "Profiles",    value: (categoryCounts[2] as { total: number }).total, icon: Flag,        badgeClass: "icon-badge-warning" },
  ]

  const TABS: { value: string; label: string }[] = [
    { value: "", label: "All" },
    ...NOTIFICATION_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
  ]

  return (
    <div className="page-content animate-slide-up">
      <div className="flex items-center gap-3">
        <div className="icon-badge icon-badge-primary h-10 w-10">
          <Bell className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground">Things that need your attention across the ERP.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon, badgeClass }) => (
          <div key={label} className="stat-card">
            <div className={`icon-badge h-12 w-12 ${badgeClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="stat-card-value">{value}</p>
              <p className="stat-card-label">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 p-1 w-fit">
          {TABS.map(({ value, label }) => {
            const qp = new URLSearchParams()
            if (unread) qp.set("unread", "true")
            if (value)  qp.set("category", value)
            const href = qp.toString() ? `/notifications?${qp}` : "/notifications"
            const active = category === value
            return (
              <Link
                key={value || "all"}
                href={href}
                className={[
                  "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                  active ? "bg-card text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {label}
              </Link>
            )
          })}
        </div>

        <Link
          href={(() => {
            const qp = new URLSearchParams()
            if (category) qp.set("category", category)
            if (!unread)  qp.set("unread", "true")
            return qp.toString() ? `/notifications?${qp}` : "/notifications"
          })()}
          className={[
            "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors",
            unread
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/80 bg-card text-foreground shadow-[var(--shadow-xs)] hover:border-primary/40 hover:text-primary",
          ].join(" ")}
        >
          <MailOpen className="h-3.5 w-3.5" />
          Unread only
        </Link>
      </div>

      <NotificationsList notifications={result?.notifications ?? []} unreadCount={unreadCount} />

      {result && result.total > 0 && (
        <TablePagination
          total={result.total}
          page={result.page}
          totalPages={result.totalPages}
          basePath="/notifications"
          params={{ ...(category ? { category } : {}), ...(unread ? { unread: "true" } : {}) }}
          itemLabel="notifications"
        />
      )}
    </div>
  )
}
