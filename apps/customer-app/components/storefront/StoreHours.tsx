import { Clock, Phone, MapPin } from "lucide-react"
import type { Storefront, StorefrontHours } from "@repo/types/customer-app"

/*
 * Opening hours and where the kitchen is.
 *
 * A Server Component. Hours are GROUPED into runs of identical days — "Mon –
 * Fri · 08:00 – 22:00" — rather than listed as seven rows, which is what the
 * vendor dashboard's own summary does and what Google Business, Uber Eats and
 * DoorDash all show. A normal week collapses to two or three lines.
 */

const DAY_ORDER = [
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
] as const

const SHORT: Record<string, string> = {
  MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu",
  FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun",
}

interface Run {
  from : string
  to   : string
  label: string
}

/** Consecutive days with identical trading collapse into one row. */
function summarise(hours: readonly StorefrontHours[]): Run[] {
  const byDay = new Map(hours.map((row) => [row.dayOfWeek, row]))
  const runs: Run[] = []

  for (const day of DAY_ORDER) {
    const row = byDay.get(day)
    const label = !row || row.isClosed ? "Closed" : `${row.openTime} – ${row.closeTime}`
    const last = runs[runs.length - 1]

    if (last && last.label === label) last.to = day
    else runs.push({ from: day, to: day, label })
  }

  return runs
}

export function StoreHours({ store }: { store: Storefront }) {
  const runs = store.hours.length > 0 ? summarise(store.hours) : []

  return (
    <div className="surface space-y-4 p-5">
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <Clock className="size-4 text-[var(--muted-foreground)]" />
          Opening hours
        </h3>

        {runs.length === 0 ? (
          /* No hours set is a real, distinct state — not "closed". Saying
           * "closed" for a kitchen that simply has not filled in the field
           * would be wrong, and the backend treats it as open for the same
           * reason. */
          <p className="text-sm text-[var(--muted-foreground)]">
            This kitchen hasn&apos;t published its hours.
          </p>
        ) : (
          <dl className="space-y-1.5 text-sm">
            {runs.map((run) => (
              <div key={run.from} className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--muted-foreground)]">
                  {run.from === run.to
                    ? SHORT[run.from]
                    : `${SHORT[run.from]} – ${SHORT[run.to]}`}
                </dt>
                <dd
                  className={`text-right tabular-nums ${
                    run.label === "Closed"
                      ? "text-[var(--muted-foreground)]"
                      : "text-[var(--foreground)]"
                  }`}
                >
                  {run.label}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <p
          className={`chip ${
            store.isOpenNow
              ? "bg-[var(--success-bg)] text-[var(--success)]"
              : "bg-[var(--muted)] text-[var(--muted-foreground)]"
          }`}
        >
          {store.isOpenNow ? "Open now" : "Closed right now"}
        </p>
      </div>

      <div className="space-y-2 border-t border-[var(--border)] pt-4 text-sm">
        <p className="flex items-start gap-2 text-[var(--muted-foreground)]">
          <MapPin className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">
            {store.addressLine1}
            {store.neighborhood ? `, ${store.neighborhood}` : ""}
          </span>
        </p>

        {store.phone && (
          <p className="flex items-center gap-2">
            <Phone className="size-4 shrink-0 text-[var(--muted-foreground)]" />
            <a
              href={`tel:${store.phone}`}
              className="cursor-pointer text-[var(--foreground)] underline-offset-4 hover:underline"
            >
              {store.phone}
            </a>
          </p>
        )}
      </div>
    </div>
  )
}
