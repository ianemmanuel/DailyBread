import Link from "next/link"
import { Trophy, MapPin } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import type { CityOutletLeaderboardEntry } from "@repo/types/admin-app"

interface Props {
  entries: CityOutletLeaderboardEntry[]
}

/** Top active cities in the selected country, ranked by outlet count. */
export function TopCitiesWidget({ entries }: Props) {
  const top = entries.slice(0, 5)
  const max = top.reduce((m, e) => Math.max(m, e.count), 0) || 1

  return (
    <div className="admin-card space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="icon-badge icon-badge-warning h-9 w-9">
          <Trophy className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Top Cities by Outlets</h2>
          <p className="text-xs text-muted-foreground">Active cities ranked by outlet count</p>
        </div>
      </div>

      {top.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No outlet activity yet"
          description="Ranked cities will appear here once outlets are onboarded."
        />
      ) : (
        <ul className="space-y-2.5">
          {top.map((entry, i) => (
            <li key={entry.cityId}>
              <Link
                href={`/cities/${entry.slug}`}
                className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/40"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                    {entry.name}
                  </p>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max((entry.count / max) * 100, entry.count > 0 ? 6 : 0)}%` }}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                  {entry.count} outlet{entry.count === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
