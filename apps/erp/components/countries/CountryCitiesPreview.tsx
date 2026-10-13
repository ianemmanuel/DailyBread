import { Building2 } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"

export interface CityPreviewEntry {
  name : string
  count: number | null
}

interface Props {
  entries: CityPreviewEntry[]
}

/**
 * Lightweight, read-only preview — NOT CitiesTable (a parallel workstream
 * owns that component and is reworking it for pagination with a different
 * prop shape). Prefers the outlet-count leaderboard when available, falls
 * back to a plain name list from the country's cities otherwise.
 */
export function CountryCitiesPreview({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No cities yet"
        description="Cities added to this country will show up here."
      />
    )
  }

  return (
    <div className="admin-card grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((city) => (
        <div key={city.name} className="stat-card-compact">
          <div className="icon-badge icon-badge-neutral h-9 w-9 shrink-0">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{city.name}</p>
            <p className="text-xs text-muted-foreground">
              {city.count === null ? "—" : `${city.count.toLocaleString()} outlets`}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
