import type { OperatingHoursEntry } from "@repo/types/backend"

/*
 * Operating-hours input validation. Pure — no I/O, no Prisma — so the rules are
 * unit-testable on their own, same convention as vendor.outletClearance.ts and
 * vendor.placement.ts.
 *
 * This exists because the write path used to pass the request body straight
 * into Prisma. Anything malformed surfaced as a PrismaClientValidationError,
 * which the error mapper turns into a flat "Invalid data provided." — true, but
 * useless to a vendor trying to work out which field it meant.
 */

const DAYS = [
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
] as const

type Day = (typeof DAYS)[number]

/** 24-hour "HH:mm", which is what the <input type="time"> on the vendor side emits. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export type OperatingHoursIssue =
  | { code: "EMPTY" }
  | { code: "TOO_MANY" }
  | { code: "NOT_AN_OBJECT"; index: number }
  | { code: "INVALID_DAY"; index: number; value: unknown }
  | { code: "DUPLICATE_DAY"; day: Day }
  | { code: "INVALID_TIME"; day: Day; field: "openTime" | "closeTime"; value: unknown }
  | { code: "ZERO_LENGTH_DAY"; day: Day }

export type ValidateResult =
  | { ok: true;  hours: OperatingHoursEntry[] }
  | { ok: false; issue: OperatingHoursIssue; message: string }

/**
 * Validates and normalizes a submitted week.
 *
 * Deliberately does NOT require openTime < closeTime: a kitchen closing at
 * 02:00 is normal, and treating that as backwards would reject real schedules.
 * Open and close being identical is rejected, since that describes a day that
 * is open for zero minutes — which is what "closed" is for.
 */
export function validateOperatingHours(input: unknown): ValidateResult {
  if (!Array.isArray(input) || input.length === 0) {
    return fail({ code: "EMPTY" }, "Provide at least one day.")
  }
  if (input.length > DAYS.length) {
    return fail({ code: "TOO_MANY" }, "A week has seven days — send at most one entry per day.")
  }

  const seen  = new Set<Day>()
  const hours: OperatingHoursEntry[] = []

  for (let index = 0; index < input.length; index++) {
    const raw = input[index]
    if (typeof raw !== "object" || raw === null) {
      return fail({ code: "NOT_AN_OBJECT", index }, "Each entry must be an object.")
    }

    const entry = raw as Record<string, unknown>
    const day   = entry.dayOfWeek

    if (typeof day !== "string" || !DAYS.includes(day as Day)) {
      return fail(
        { code: "INVALID_DAY", index, value: day },
        `"${String(day)}" is not a day of the week.`,
      )
    }
    if (seen.has(day as Day)) {
      return fail({ code: "DUPLICATE_DAY", day: day as Day }, `${title(day)} appears more than once.`)
    }
    seen.add(day as Day)

    const isClosed = entry.isClosed === true

    // A closed day's times are never used, so they're normalized rather than
    // validated — a vendor shouldn't be blocked by a stale time on a day they
    // just marked closed.
    if (isClosed) {
      hours.push({ dayOfWeek: day as Day, openTime: "00:00", closeTime: "00:00", isClosed: true })
      continue
    }

    for (const field of ["openTime", "closeTime"] as const) {
      const value = entry[field]
      if (typeof value !== "string" || !TIME_PATTERN.test(value)) {
        return fail(
          { code: "INVALID_TIME", day: day as Day, field, value },
          `${title(day)} needs a valid ${field === "openTime" ? "opening" : "closing"} time in HH:mm format.`,
        )
      }
    }

    const openTime  = entry.openTime  as string
    const closeTime = entry.closeTime as string

    if (openTime === closeTime) {
      return fail(
        { code: "ZERO_LENGTH_DAY", day: day as Day },
        `${title(day)} opens and closes at the same time. Mark it closed instead.`,
      )
    }

    hours.push({ dayOfWeek: day as Day, openTime, closeTime, isClosed: false })
  }

  return { ok: true, hours }
}

function fail(issue: OperatingHoursIssue, message: string): ValidateResult {
  return { ok: false, issue, message }
}

function title(day: string): string {
  return day.charAt(0) + day.slice(1).toLowerCase()
}
