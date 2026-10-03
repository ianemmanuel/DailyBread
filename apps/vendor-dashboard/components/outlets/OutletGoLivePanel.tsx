import Link from "next/link"
import { CheckCircle2, CircleAlert, Clock, ArrowRight } from "lucide-react"
import type { OutletGoLiveStatus, OutletGoLiveBlocker } from "@/types/outlet"

/*
 * The outlet's live status, rendered straight off the backend's
 * getOutletGoLiveStatus — the frontend never re-derives it. Tells the vendor
 * exactly what (if anything) is standing between this outlet and taking
 * orders, and who owns each item.
 */

interface BlockerCopy {
  title : string
  detail: string
  /** A link the vendor can follow to fix it themselves, if any. */
  action?: { label: string; href: string }
  /** true → this is on us, not the vendor; shown as "in progress" not "action needed". */
  platform?: boolean
}

const BLOCKER_COPY: Record<OutletGoLiveBlocker, BlockerCopy> = {
  PENDING_DOCUMENTS: {
    title : "A required document is being reviewed",
    detail: "This outlet needs an approved document before it can take orders. Upload it under Documents if you haven't already.",
    action: { label: "Go to Documents", href: "/settings/documents" },
  },
  REVIEW_REJECTED: {
    title : "This outlet was rejected in review",
    detail: "Edit the details below to address the feedback, then save — it goes back into the queue automatically.",
  },
  OUTLET_SUSPENDED: {
    title : "Suspended by our team",
    detail: "This outlet is temporarily suspended. Check your email for the reason, or contact support.",
  },
  OUTLET_SUSPENDED_COMPLIANCE: {
    title : "Suspended — a required document expired",
    detail: "Upload a current version of the expired document and it will be reinstated once approved.",
    action: { label: "Go to Documents", href: "/settings/documents" },
  },
  OUTLET_BANNED: {
    title : "This outlet has been banned",
    detail: "Contact support if you believe this is a mistake.",
  },
  OUTLET_DEACTIVATED: {
    title : "You've deactivated this outlet",
    detail: "Reactivate it from the actions above to start taking orders here again.",
  },
  TEMPORARILY_CLOSED: {
    title : "You've marked this outlet temporarily closed",
    detail: "Reopen it from the actions above when you're ready to take orders again.",
  },
  VENDOR_NOT_LIVE: {
    title : "Your storefront isn't published yet",
    detail: "Finish setting up your public profile and publish it — that turns on every outlet at once.",
    action: { label: "Go to Public profile", href: "/settings/profile" },
  },
  ZONE_LEVEL_TOO_LOW: {
    title : "We're still setting up operations in this area",
    detail: "Your outlet is registered, but ordering isn't open here yet. We'll let you know when it is.",
    platform: true,
  },
  ZONE_NOT_OPERATIONAL: {
    title : "Ordering is paused in this area",
    detail: "Operations here are temporarily on hold. This is on our side — nothing for you to do.",
    platform: true,
  },
}

export function OutletGoLivePanel({ status }: { status: OutletGoLiveStatus }) {
  if (status.isAcceptingOrders) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-[var(--success)]/30 bg-[var(--success-bg)] px-5 py-4">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--success)]" />
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">This outlet is accepting orders</p>
          <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
            Live in {status.zone.name ?? "your area"}
            {describeCapabilities(status.zone.capabilities)}.
          </p>
        </div>
      </div>
    )
  }

  const items = status.blockers.map((b) => ({ key: b, ...BLOCKER_COPY[b] }))

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex items-center gap-2">
        <CircleAlert className="size-4 shrink-0 text-[var(--warning)]" />
        <p className="text-sm font-semibold text-[var(--foreground)]">Not taking orders yet</p>
      </div>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        {items.length === 1 ? "One thing" : `${items.length} things`} to sort out before this outlet goes live.
      </p>

      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-3">
            {item.platform
              ? <Clock className="mt-0.5 size-4 shrink-0 text-[var(--muted-foreground)]" />
              : <CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" />}
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--foreground)]">{item.title}</p>
              <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">{item.detail}</p>
              {item.action && (
                <Link
                  href={item.action.href}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
                >
                  {item.action.label}
                  <ArrowRight className="size-3" />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** What the vendor can do in this area, from the capability flags the server
 *  sends — never from a zone level, which the vendor is not sent. */
function describeCapabilities(caps: OutletGoLiveStatus["zone"]["capabilities"]): string {
  const parts = [
    caps.orders      && "on-demand orders",
    caps.weDeliver   && "we deliver",
    caps.selfDeliver && "you deliver",
    caps.mealPlans   && "meal plans",
  ].filter(Boolean)
  return parts.length > 0 ? ` · ${parts.join(", ")}` : ""
}
