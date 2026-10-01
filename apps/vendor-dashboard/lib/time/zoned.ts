/*
 * Wall time in a NAMED timezone ⇄ an instant — for datetime-local inputs whose
 * meaning is the outlet's clock, not the browser's.
 *
 * The backend decides which zone (the one the vendor's outlets share) and
 * stores UTC; this only converts what the form shows and sends, the same way
 * lib/menu/money.ts converts a typed price with the currency scale the server
 * supplied. Intl does the zone arithmetic, so DST is the platform's problem.
 */

const pad = (n: number) => String(n).padStart(2, "0")

/** The zone's UTC offset at an instant, in ms (positive east of Greenwich). */
function offsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"))
  return wallAsUtc - Math.floor(instant / 1000) * 1000
}

/** "YYYY-MM-DDTHH:mm" read as wall time in `timeZone` → ISO instant. */
export function zonedLocalToIso(local: string, timeZone: string): string {
  const [date = "", time = "00:00"] = local.split("T")
  const [y, m, d] = date.split("-").map(Number)
  const [hh, mm] = time.split(":").map(Number)
  const wall = Date.UTC(y!, m! - 1, d!, hh!, mm!)
  // Two passes settle the offset on either side of a DST change.
  let instant = wall - offsetMs(wall, timeZone)
  instant = wall - offsetMs(instant, timeZone)
  return new Date(instant).toISOString()
}

/** An ISO instant → "YYYY-MM-DDTHH:mm" as wall time in `timeZone`. */
export function isoToZonedLocal(iso: string, timeZone: string): string {
  const shifted = new Date(new Date(iso).getTime() + offsetMs(new Date(iso).getTime(), timeZone))
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
}
