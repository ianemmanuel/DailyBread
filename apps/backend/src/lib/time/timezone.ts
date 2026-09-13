/*
 * Is this a real timezone, and does it belong to that country?
 *
 * Pure — no I/O. Written after a live data bug: BOTH Kenyan cities were saved
 * as `Africa/Addis_Ababa`. Nothing misbehaved, because Addis Ababa and Nairobi
 * are both UTC+3 — which is exactly what makes the class of bug dangerous. The
 * same mistake between, say, Lagos and Nairobi would have silently shifted
 * every operating-hours and happy-hour calculation in that market by three
 * hours, and nobody would have found it by looking at a screen.
 *
 * The admin timezone picker offers every IANA zone on earth, alphabetically, so
 * picking the wrong one from an adjacent entry takes one careless click. The
 * backend accepted whatever arrived, with no validation at all.
 *
 * `Country.timezones` is a seeded String[] populated for all 193 countries, so
 * there is an authoritative answer available for free: a city's timezone must
 * be one its own country actually uses. That turns a silent data error into a
 * refusal at the point of entry.
 */

/** Every zone the JS engine's own IANA database knows. No npm package, and no
 *  bundled copy to drift out of date — the same source the admin picker uses. */
const SUPPORTED: ReadonlySet<string> = new Set(
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [],
)

/*
 * Aliases that are genuinely fine but are absent from the canonical list.
 *
 * Intl.supportedValuesOf returns CANONICAL names only, so "UTC" is missing from
 * it even though Intl.DateTimeFormat accepts it — and localClock falls back to
 * exactly that string, so refusing it would break this file's own sibling.
 */
const ALLOWED_ALIASES: ReadonlySet<string> = new Set(["UTC"])

/**
 * Whether a string names a timezone a CITY may be pinned to.
 *
 * Deliberately stricter than "Intl can parse it", because Intl accepts two
 * further things that are wrong for a city, and both were verified against this
 * runtime rather than assumed:
 *
 *   - a raw OFFSET ("+03:00"). Not a place: it carries no daylight-saving rule,
 *     so a city pinned to one silently drifts twice a year in any market that
 *     observes DST.
 *   - a legacy ABBREVIATION ("EAT", "CST"). Ambiguous by construction — CST is
 *     US Central, China Standard and Cuba Standard depending on who is asking.
 *
 * So the canonical IANA list is the definition, plus the small alias set above.
 * An engine without supportedValuesOf falls back to requiring an Area/Location
 * shape that Intl can actually resolve, which excludes both cases too.
 */
export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false
  const tz = value.trim()

  if (ALLOWED_ALIASES.has(tz)) return true
  if (SUPPORTED.size > 0) return SUPPORTED.has(tz)

  // Fallback only: no canonical list available on this engine.
  if (!tz.includes("/")) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date())
    return true
  } catch {
    return false
  }
}

export type TimezoneProblem =
  | { code: "TIMEZONE_REQUIRED";     message: string }
  | { code: "TIMEZONE_UNKNOWN";      message: string }
  | { code: "TIMEZONE_WRONG_COUNTRY"; message: string }

/**
 * Validate a city's timezone against its country.
 *
 * `countryTimezones` empty is treated as "no opinion" rather than "nothing is
 * allowed" — a country row without seeded zones must not make its cities
 * unsaveable. Every country currently has them, and the check bites where it
 * matters.
 */
export function validateCityTimezone(
  value           : unknown,
  countryTimezones: readonly string[],
  countryName     : string,
): { ok: true; timezone: string } | { ok: false; problem: TimezoneProblem } {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, problem: {
      code: "TIMEZONE_REQUIRED",
      message: "A city needs a timezone.",
    } }
  }

  const timezone = value.trim()

  if (!isValidTimezone(timezone)) {
    return { ok: false, problem: {
      code: "TIMEZONE_UNKNOWN",
      message: `"${timezone}" is not a recognised timezone.`,
    } }
  }

  if (countryTimezones.length > 0 && !countryTimezones.includes(timezone)) {
    return { ok: false, problem: {
      code: "TIMEZONE_WRONG_COUNTRY",
      message: countryTimezones.length === 1
        ? `Cities in ${countryName} use ${countryTimezones[0]}, not ${timezone}.`
        : `${timezone} is not used in ${countryName}. Choose one of: ${countryTimezones.join(", ")}.`,
    } }
  }

  return { ok: true, timezone }
}

/** The zone to offer when a country has exactly one — which is true for most
 *  countries, and means an admin adding a city never has to choose at all. */
export function defaultTimezoneFor(countryTimezones: readonly string[]): string | null {
  return countryTimezones.length === 1 ? countryTimezones[0]! : null
}
