"use client"

import Link from "next/link"
import {
  CheckCircle2,
  PlusCircle,
  Store,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
} from "lucide-react"

// ─── Static placeholder data ──────────────────────────────────
// Replace with real /admin/v1/platform/activity endpoint once available.

interface ActivityItem {
  id:        string
  icon:      React.ElementType
  iconColor: string
  iconBg:    string
  title:     string
  sub?:      string
  time:      string
  href?:     string
}

const STATIC_ACTIVITY: ActivityItem[] = [
  {
    id:        "1",
    icon:      CheckCircle2,
    iconColor: "var(--success)",
    iconBg:    "var(--success-bg)",
    title:     "Kenya was marked as active",
    sub:       "by John Admin",
    time:      "2 hours ago",
    href:      "/countries/ke",
  },
  {
    id:        "2",
    icon:      PlusCircle,
    iconColor: "var(--info)",
    iconBg:    "var(--info-bg)",
    title:     "3 new cities added to Uganda",
    sub:       "Kampala, Entebbe, Jinja",
    time:      "5 hours ago",
    href:      "/countries/ug/cities",
  },
  {
    id:        "3",
    icon:      Store,
    iconColor: "var(--primary)",
    iconBg:    "var(--primary-subtle)",
    title:     "142 new vendors registered in Tanzania",
    sub:       "Awaiting verification",
    time:      "1 day ago",
    href:      "/vendors?country=tz",
  },
  {
    id:        "4",
    icon:      AlertTriangle,
    iconColor: "var(--warning)",
    iconBg:    "var(--warning-bg)",
    title:     "Ghana requires attention",
    sub:       "Order success rate below 90%",
    time:      "2 days ago",
    href:      "/countries/gh",
  },
  {
    id:        "5",
    icon:      RefreshCw,
    iconColor: "var(--success)",
    iconBg:    "var(--success-bg)",
    title:     "Rwanda health status updated to Healthy",
    sub:       "All metrics performing well",
    time:      "3 days ago",
    href:      "/countries/rw",
  },
]

export function RecentCountryActivity() {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--foreground)" }}
        >
          Recent Country Activity
        </h3>
        <span
          className="text-[11px]"
          style={{ color: "var(--muted-foreground)" }}
        >
          Illustrative — live feed coming soon
        </span>
      </div>

      {/* Activity list */}
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        {STATIC_ACTIVITY.map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.id}
              className="group flex items-start gap-3 px-4 py-3 transition-colors duration-100"
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = "var(--accent)"
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = ""
              }}
            >
              {/* Icon */}
              <div
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: item.iconBg }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: item.iconColor }} />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-medium leading-tight"
                  style={{ color: "var(--foreground)" }}
                >
                  {item.title}
                </p>
                {item.sub && (
                  <p
                    className="mt-0.5 text-xs leading-tight"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {item.sub}
                  </p>
                )}
              </div>

              {/* Time */}
              <span
                className="shrink-0 text-xs tabular-nums"
                style={{ color: "var(--muted-foreground)" }}
              >
                {item.time}
              </span>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div
        className="border-t px-4 py-2.5"
        style={{ borderColor: "var(--border)" }}
      >
        <Link
          href="/activity"
          className="flex items-center gap-1 text-[11px] font-medium transition-colors duration-150"
          style={{ color: "var(--primary)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--primary-hover)"
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--primary)"
          }}
        >
          View all activity
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}