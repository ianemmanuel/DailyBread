import { FlaskConical } from "lucide-react"

/**
 * Marks a section whose data is illustrative (lib/data/market/sample). Always
 * visible and always worded the same, so sample inventory can never be read as
 * a market's real offering. Only renders in builds where sample data is on.
 */
export function SampleBadge() {
  return (
    <span
      title="Illustrative data while this listing is being built — not real kitchens or prices."
      className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
    >
      <FlaskConical aria-hidden className="size-3" />
      Sample
    </span>
  )
}
