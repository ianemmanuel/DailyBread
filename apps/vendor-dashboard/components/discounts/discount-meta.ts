import type { DiscountState, DiscountDay } from "@/lib/queries/discounts"

/*
 * The one place a discount state is put into words.
 *
 * The backend returns a code and never a sentence — same split as
 * VendorGoLiveBlocker and lib/readiness.ts — so the list, the detail panel and
 * any future email describe the same state identically.
 */

export interface StateMeta {
  label: string
  /** What the vendor should understand, and where relevant what to do. */
  hint : string
  tone : "live" | "waiting" | "stopped" | "done"
}

export const DISCOUNT_STATE_META: Record<DiscountState, StateMeta> = {
  RUNNING: {
    label: "Running",
    hint : "Customers are seeing this.",
    tone : "live",
  },
  SCHEDULED: {
    label: "Scheduled",
    hint : "It starts on its own, on the date you set.",
    tone : "waiting",
  },
  AWAITING_GO_LIVE: {
    label: "Waiting for you to go live",
    hint : "The dates are right, but your storefront isn't published yet, so nobody can reach it. It starts the moment you publish.",
    tone : "waiting",
  },
  PAUSED: {
    label: "Paused",
    hint : "You stopped this. Resume it whenever you like.",
    tone : "stopped",
  },
  SUSPENDED: {
    label: "Stopped by DailyBread",
    hint : "You can't edit or resume this one. Get in touch if you think it's a mistake.",
    tone : "stopped",
  },
  EXPIRED: {
    label: "Finished",
    hint : "It reached its end date. Make a new one to run it again.",
    tone : "done",
  },
  EXHAUSTED: {
    label: "Budget used up",
    hint : "It hit the limit you set. Raise the limit or make a new one.",
    tone : "done",
  },
}

export const TONE_CLASS: Record<StateMeta["tone"], string> = {
  live   : "bg-emerald-600 text-white",
  waiting: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  stopped: "bg-[var(--destructive)]/10 text-[var(--destructive)]",
  done   : "bg-[var(--muted)] text-[var(--muted-foreground)]",
}

export const DAYS: { value: DiscountDay; short: string }[] = [
  { value: "MONDAY",    short: "Mon" },
  { value: "TUESDAY",   short: "Tue" },
  { value: "WEDNESDAY", short: "Wed" },
  { value: "THURSDAY",  short: "Thu" },
  { value: "FRIDAY",    short: "Fri" },
  { value: "SATURDAY",  short: "Sat" },
  { value: "SUNDAY",    short: "Sun" },
]

/** "Every day", "Fri only", "Mon, Wed, Fri" — plus the hour window if set. */
export function describeSchedule(
  daysOfWeek: DiscountDay[],
  startTime : string | null,
  endTime   : string | null,
): string {
  const days = daysOfWeek.length === 0
    ? "Every day"
    : DAYS.filter((d) => daysOfWeek.includes(d.value)).map((d) => d.short).join(", ")

  if (!startTime || !endTime) return days
  return `${days} · ${startTime}–${endTime}`
}

/** 2000 → "20%". Mirrors formatRateBps on the backend so a table cell does not
 *  need a round trip to render a label. */
export function formatBps(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`
}

/** "20" as typed → 2000. A percentage is a human's unit and basis points are
 *  the stored one; this is the only place they meet. */
export function toBps(input: string): number | null {
  const cleaned = input.replace(/[\s%,]/g, "")
  if (!cleaned) return null
  if (!/^\d*\.?\d*$/.test(cleaned)) return null
  const percent = Number(cleaned)
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null
  return Math.round(percent * 100)
}
