"use client"

import { CheckCircle2, MapPin, Store, ShieldAlert } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { cn } from "@repo/ui/lib/utils"

interface ActivityEvent {
  id:          string
  description: string
  sub?:        string
  time:        string
  icon:        "check" | "pin" | "store" | "alert"
}

const ACTIVITY_FEED: ActivityEvent[] = [
  {
    id:          "1",
    description: "Kenya was marked as active",
    sub:         "by John Admin",
    time:        "2 hours ago",
    icon:        "check",
  },
  {
    id:          "2",
    description: "3 new cities added to Uganda",
    sub:         "Kampala, Entebbe, Jinja",
    time:        "5 hours ago",
    icon:        "pin",
  },
  {
    id:          "3",
    description: "142 new vendors registered in Tanzania",
    sub:         "Awaiting verification",
    time:        "1 day ago",
    icon:        "store",
  },
  {
    id:          "4",
    description: "Ghana requires attention",
    sub:         "Order success rate below 90%",
    time:        "2 days ago",
    icon:        "alert",
  },
  {
    id:          "5",
    description: "Rwanda health status updated to Healthy",
    sub:         "All metrics performing well",
    time:        "3 days ago",
    icon:        "check",
  },
]

function ActivityIcon({ icon }: { icon: ActivityEvent["icon"] }) {
  const base = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
  if (icon === "check")
    return (
      <div className={cn(base, "bg-success/12")}>
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
      </div>
    )
  if (icon === "pin")
    return (
      <div className={cn(base, "bg-info/12")}>
        <MapPin className="h-3.5 w-3.5 text-info" />
      </div>
    )
  if (icon === "store")
    return (
      <div className={cn(base, "bg-primary/12")}>
        <Store className="h-3.5 w-3.5 text-primary" />
      </div>
    )
  return (
    <div className={cn(base, "bg-warning/12")}>
      <ShieldAlert className="h-3.5 w-3.5 text-warning" />
    </div>
  )
}

export function CountryActivityFeed() {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3.5">
        <h3 className="font-display text-sm font-semibold text-foreground">
          Recent Country Activity
        </h3>
      </div>

      <div className="divide-y divide-border/60">
        {ACTIVITY_FEED.map((event) => (
          <div key={event.id} className="flex items-start gap-3 px-5 py-3.5">
            <ActivityIcon icon={event.icon} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground leading-snug">
                {event.description}
              </p>
              {event.sub && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">{event.sub}</p>
              )}
            </div>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">
              {event.time}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-border px-5 py-3">
        <Button
          variant="ghost"
          className="h-8 w-full text-xs text-muted-foreground hover:text-foreground"
        >
          View all activity
        </Button>
      </div>
    </div>
  )
}