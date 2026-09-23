import { MapPin } from "lucide-react"

/*
 * Where we operate in one city, by name.
 *
 * ── What this deliberately does not say ────────────────────────────────────
 *
 * Every area reads the same. There is no badge for a zone that the platform
 * delivers in versus one where the kitchen brings the food itself, and no hint
 * of a zone's level — that is internal vocabulary which would also map out
 * where the platform is expanding next. A customer needs one fact: can we
 * reach them. How the operation is arranged behind that answer is ours.
 *
 * Areas where we do not operate at all are simply absent, so the list is
 * never a catalogue of our gaps.
 *
 * A Server Component in the page, and plain data in the picker — no state
 * either way.
 */
export function AreasOfOperation({
  cityName,
  areas,
  /** A shorter, tighter presentation for inside the location picker. */
  compact = false,
}: {
  cityName: string
  areas: string[]
  compact?: boolean
}) {
  /* Nothing to claim. A heading over an empty list would read as a bug, and
   * "we operate in nowhere" is worse than saying nothing at all. */
  if (areas.length === 0) return null

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <p className={compact ? "text-sm font-medium text-foreground" : "text-sm font-semibold text-foreground"}>
        {compact ? `Where we operate in ${cityName}` : `Areas we serve in ${cityName}`}
      </p>

      <ul className="flex flex-wrap gap-2">
        {areas.map((area) => (
          <li
            key={area}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground"
          >
            <MapPin aria-hidden className="size-3.5 shrink-0 text-primary-text" />
            {area}
          </li>
        ))}
      </ul>

      {!compact && (
        <p className="text-sm text-muted-foreground">
          Share your address to see the kitchens that can reach you.
        </p>
      )}
    </div>
  )
}
