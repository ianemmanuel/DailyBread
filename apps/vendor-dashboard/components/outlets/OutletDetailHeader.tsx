import Link from "next/link"
import { ChevronLeft, Crown, MapPin } from "lucide-react"
import { OutletStatusBadges } from "@/components/outlets/OutletStatusBadges"
import type { Outlet } from "@/types/outlet"

/*
 * The outlet page header.
 *
 * Replaces a PageHeader wrapped in a `flex items-center` row, which broke in
 * two ways on narrow screens: the title had no min-w-0 so a long outlet name
 * pushed the badges off the edge, and vertically centring the back button
 * against a two-line header left it floating beside the middle of the text.
 *
 * Here the back link is its own row above the title (the pattern every mobile
 * merchant app uses), the title truncates on one line, and the badges wrap
 * underneath instead of competing for the same row.
 */
export function OutletDetailHeader({ outlet }: { outlet: Outlet }) {
  return (
    <div className="fade-up space-y-3 border-b border-border/50 pb-5">
      <Link
        href="/outlets"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
      >
        <ChevronLeft className="size-4" />
        All outlets
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="font-display truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {outlet.name}
          </h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{outlet.city?.name ?? "Location not set"}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:justify-end">
          {outlet.isMainOutlet && (
            <span className="badge-primary">
              <Crown className="size-3" />Primary
            </span>
          )}
          <OutletStatusBadges outlet={outlet} />
        </div>
      </div>
    </div>
  )
}
