/*
 * Wall-clock time in a named place.
 *
 * Pure — no I/O. Exists because this platform stores several kinds of
 * schedule as bare "HH:mm" strings with no offset — an outlet's operating
 * hours, a discount's happy-hour window — and every one of them means LOCAL
 * time at the outlet, which the schema says explicitly.
 *
 * Evaluating those against the server's own clock is only correct when the
 * server happens to sit in the same zone as the outlet. It does not, in
 * general: a platform operating across several countries has outlets hours
 * apart, and a server in UTC would open a Nairobi happy hour at 20:00 local
 * instead of 17:00.
 *
 * City.timezone is a required column, so an outlet's local time is always
 * knowable. This file is the single way to read it.
 */

const DAY_NAMES = [
  "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY",
] as const

export type DayName = (typeof DAY_NAMES)[number]

export interface LocalClock {
  /** 0 = Sunday, matching Date.getDay() and the DAY_ORDER arrays elsewhere. */
  dayIndex: number
  day     : DayName
  /** Minutes past local midnight. */
  minutes : number
}

/**
 * The local day and minute for an instant, in an IANA zone.
 *
 * Falls back to the server's own clock when no zone is given, which keeps every
 * existing caller behaving exactly as it did — and to UTC when a zone is given
 * but is not one Intl recognises, because a malformed timezone string must
 * degrade rather than take a request down.
 */
export function localClock(now: Date, timeZone?: string | null): LocalClock {
  if (!timeZone) {
    return { dayIndex: now.getDay(), day: DAY_NAMES[now.getDay()]!, minutes: now.getHours() * 60 + now.getMinutes() }
  }

  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour   : "2-digit",
      minute : "2-digit",
      hour12 : false,
    }).formatToParts(now)
  } catch {
    return localClock(now, "UTC")
  }

  const read = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  const weekday = read("weekday").toUpperCase()
  const found = DAY_NAMES.findIndex((d) => d.startsWith(weekday))
  const dayIndex = found < 0 ? now.getUTCDay() : found

  // Some ICU builds render midnight as "24" under hour12: false.
  const hour = Number(read("hour")) % 24
  const minute = Number(read("minute"))

  return {
    dayIndex,
    day    : DAY_NAMES[dayIndex]!,
    minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
  }
}

/** Minutes past midnight for "HH:mm", or null when the string is not that
 *  exact shape. Lenient about surrounding whitespace, strict about everything
 *  else — "8:30" and "24:00" are both refused. */
export function parseHhMm(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const mins  = Number(match[2])
  if (hours > 23 || mins > 59) return null
  return hours * 60 + mins
}

export { DAY_NAMES }
