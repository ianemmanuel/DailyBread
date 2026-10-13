/**
 *
 * Timezone utilities using the built-in Intl API (zero dependencies).
 * Falls back gracefully in environments that don't support
 * Intl.supportedValuesOf (e.g. older Node versions — use the static list).
 *
 * Install luxon for offset labels (already likely in your project):
 *   pnpm install luxon && pnpm install -D @types/luxon
 */

//* Get all valid IANA timezone strings

function getAllTimezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone")
  } catch {
    //? Fallback for environments that don't support it
    return FALLBACK_TIMEZONES
  }
}

//* Format a timezone for display

/**
 * Returns a human-readable label for a timezone string.
 * e.g. "Africa/Nairobi" → "Africa/Nairobi (UTC+03:00)"
 *
 * Uses Intl.DateTimeFormat — no external dependency needed.
 */
export function formatTimezoneLabel(tz: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en", {
      timeZone     : tz,
      timeZoneName : "shortOffset",
    })

    // Extract the UTC offset part from the formatted date
    const parts = formatter.formatToParts(new Date())
    const offset = parts.find((p) => p.type === "timeZoneName")?.value ?? ""

    // Clean up display name: "Africa/Nairobi" → "Nairobi (Africa)"
    const [region, ...city] = tz.split("/")
    const cityName = city.join("/").replace(/_/g, " ") || region

    return city.length > 0
      ? `${cityName} — ${region} (${offset})`
      : `${region} (${offset})`
  } catch {
    return tz
  }
}

//* Build the full option list

export interface TimezoneOption {
  value : string   // IANA key  e.g. "Africa/Nairobi"
  label : string   // Display   e.g. "Nairobi — Africa (UTC+03:00)"
  offset: number   // Minutes from UTC for sorting
}

function getOffsetMinutes(tz: string): number {
  try {
    const now = new Date()
    const utc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }))
    const local = new Date(now.toLocaleString("en-US", { timeZone: tz }))
    return (local.getTime() - utc.getTime()) / 60_000
  } catch {
    return 0
  }
}

let _cachedOptions: TimezoneOption[] | null = null

/**
 * Returns all timezone options sorted by UTC offset.
 * Memoised — only computed once per process.
 */
export function getTimezoneOptions(): TimezoneOption[] {
  if (_cachedOptions) return _cachedOptions

  _cachedOptions = getAllTimezones()
    .map((tz) => ({
      value : tz,
      label : formatTimezoneLabel(tz),
      offset: getOffsetMinutes(tz),
    }))
    .sort((a, b) => a.offset - b.offset || a.value.localeCompare(b.value))

  return _cachedOptions
}

/**
 * Search timezones by query string (city name or region).
 * Used by the combobox search input.
 */
export function searchTimezones(query: string): TimezoneOption[] {
  const q = query.toLowerCase().replace(/\s+/g, "")
  return getTimezoneOptions().filter(
    (tz) =>
      tz.value.toLowerCase().replace(/[/_]/g, "").includes(q) ||
      tz.label.toLowerCase().replace(/\s+/g, "").includes(q),
  )
}

//* Fallback list (used if Intl.supportedValuesOf is unavailable)
// Covers the cities most likely to appear in your markets.
// This is a safety net only — in production Node 18+ will use the full list.

const FALLBACK_TIMEZONES = [
  "Africa/Abidjan", "Africa/Accra", "Africa/Addis_Ababa", "Africa/Cairo",
  "Africa/Casablanca", "Africa/Dar_es_Salaam", "Africa/Harare",
  "Africa/Johannesburg", "Africa/Kampala", "Africa/Khartoum",
  "Africa/Kinshasa", "Africa/Lagos", "Africa/Lusaka", "Africa/Maputo",
  "Africa/Nairobi", "Africa/Tripoli", "Africa/Tunis",
  "America/Bogota", "America/Chicago", "America/Lima",
  "America/Los_Angeles", "America/Mexico_City", "America/New_York",
  "America/Sao_Paulo", "America/Toronto",
  "Asia/Almaty", "Asia/Baghdad", "Asia/Bangkok", "Asia/Beirut",
  "Asia/Colombo", "Asia/Dhaka", "Asia/Dubai", "Asia/Hong_Kong",
  "Asia/Jakarta", "Asia/Karachi", "Asia/Kathmandu", "Asia/Kolkata",
  "Asia/Kuala_Lumpur", "Asia/Kuwait", "Asia/Manila", "Asia/Muscat",
  "Asia/Qatar", "Asia/Riyadh", "Asia/Seoul", "Asia/Shanghai",
  "Asia/Singapore", "Asia/Taipei", "Asia/Tashkent", "Asia/Tokyo",
  "Atlantic/Reykjavik",
  "Australia/Melbourne", "Australia/Perth", "Australia/Sydney",
  "Europe/Amsterdam", "Europe/Athens", "Europe/Berlin", "Europe/Brussels",
  "Europe/Budapest", "Europe/Copenhagen", "Europe/Dublin", "Europe/Helsinki",
  "Europe/Istanbul", "Europe/Kiev", "Europe/Lisbon", "Europe/London",
  "Europe/Madrid", "Europe/Moscow", "Europe/Oslo", "Europe/Paris",
  "Europe/Prague", "Europe/Rome", "Europe/Stockholm", "Europe/Vienna",
  "Europe/Warsaw", "Europe/Zurich",
  "Pacific/Auckland", "Pacific/Honolulu",
  "UTC",
]