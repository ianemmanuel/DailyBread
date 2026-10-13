import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { ArrowRight } from "lucide-react"

export interface VendorSectionCard {
  href       : string
  icon       : LucideIcon
  badgeClass : string
  title      : string
  description: string
  /** Live at-a-glance count — omitted (not zero) when there's nothing worth calling out. */
  count?     : number
  countLabel?: string
  /** Styles the count as a nudge rather than neutral info (e.g. open compliance issues, flagged items). */
  urgent?    : boolean
}

/**
 * Permission-gated entry grid for every /vendors/* section the viewing
 * admin can actually read — replaces the old two-card (Applications/
 * Accounts only) quick-links grid, which made the home page feel shallow
 * once Outlets/Compliance/Appeals/Profiles/Revenue existed alongside them.
 * Each card is a real orientation point (a live count), not a duplicate
 * of what the destination page already shows in full.
 */
export function VendorsSectionsGrid({ cards }: { cards: VendorSectionCard[] }) {
  if (cards.length === 0) return null
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(({ href, icon: Icon, badgeClass, title, description, count, countLabel, urgent }) => (
        <Link
          key={href}
          href={href}
          className="group admin-card flex items-start gap-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-md)]"
        >
          <div className={`icon-badge ${badgeClass} h-12 w-12 shrink-0`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            {count !== undefined && count > 0 && (
              <p className={`mt-3 text-xs font-medium ${urgent ? "text-warning" : "text-primary"}`}>
                {count} {countLabel}
              </p>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}
