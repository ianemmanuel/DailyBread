import { DAYS_OF_WEEK, DAY_LABELS, type DayOfWeek, type OperatingHours } from "@/types/outlet"

/*
 * Operating-hours presentation. Pure — no React, no fetching.
 *
 * The point of this file is the summary: every merchant dashboard worth
 * copying (Uber Eats, DoorDash, Google Business) shows hours as a handful of
 * grouped rows — "Mon – Fri · 08:00 – 22:00" — not seven near-identical lines.
 * The editor is where seven rows belong, and that only opens on demand.
 */

export interface DayEntry {
  dayOfWeek: DayOfWeek
  openTime : string
  closeTime: string
  isClosed : boolean
}

export const DEFAULT_OPEN  = "08:00"
export const DEFAULT_CLOSE = "22:00"

/**
 * A full Monday–Sunday week, filling in anything the outlet hasn't set.
 *
 * Note the defaults are only ever a starting point for the *editor* — callers
 * deciding what to *display* must check `hasHoursSet` first, or they'll show a
 * vendor confident-looking hours nobody ever saved.
 */
export function buildWeek(existing: OperatingHours[]): DayEntry[] {
  return DAYS_OF_WEEK.map((day) => {
    const found = existing.find((e) => e.dayOfWeek === day)
    return {
      dayOfWeek: day,
      openTime : found?.openTime  ?? DEFAULT_OPEN,
      closeTime: found?.closeTime ?? DEFAULT_CLOSE,
      isClosed : found?.isClosed  ?? false,
    }
  })
}

export function hasHoursSet(existing: OperatingHours[]): boolean {
  return existing.length > 0
}

export interface HoursSummaryRow {
  /** "Mon" or "Mon – Fri". */
  days  : string
  /** "08:00 – 22:00", or "Closed". */
  hours : string
  closed: boolean
}

/**
 * Collapses the week into consecutive runs of identical days. Seven rows
 * becomes two or three for almost every real schedule, which is what makes
 * this fit in a narrow column beside the rest of the page.
 */
export function summarizeHours(week: DayEntry[]): HoursSummaryRow[] {
  const rows: HoursSummaryRow[] = []

  for (const entry of week) {
    const last = rows[rows.length - 1]
    const sameAsLast =
      last !== undefined &&
      last.closed === entry.isClosed &&
      last.hours === formatEntry(entry)

    if (sameAsLast && last) {
      // Extend the run: keep the first day, replace (or add) the last.
      last.days = `${last.days.split(" – ")[0]} – ${DAY_LABELS[entry.dayOfWeek]}`
      continue
    }

    rows.push({
      days  : DAY_LABELS[entry.dayOfWeek],
      hours : formatEntry(entry),
      closed: entry.isClosed,
    })
  }

  return rows
}

function formatEntry(entry: DayEntry): string {
  return entry.isClosed ? "Closed" : `${entry.openTime} – ${entry.closeTime}`
}

/** True when every day is marked closed — worth calling out, since it means
 *  the outlet can never take an order however healthy it otherwise looks. */
export function isClosedAllWeek(week: DayEntry[]): boolean {
  return week.every((d) => d.isClosed)
}
