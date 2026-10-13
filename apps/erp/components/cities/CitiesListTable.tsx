import Link from "next/link"
import { Building2, MapPin } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/shared/EmptyState"
import { CityActions } from "@/components/cities/CityActions"
import { TablePagination } from "@/components/shared/TablePagination"
import type { CityListResult } from "@/types/city.types"

/**
 * Paginated cities table for the top-level /cities index page — consumes
 * the { cities, total, totalPages } contract from
 * GET /admin/v1/countries/:countryRef/cities.
 *
 * Not to be confused with CitiesTable, which still takes a plain City[]
 * (the embedded `country.cities` relation on the country detail page).
 */
interface Props {
  result       : CityListResult | null
  page         : string
  countrySlug  : string
  status       : string
  search       : string
  countryStatus: string
  canWrite     : boolean
}

function StatusBadge({ status }: { status: string }) {
  return status === "ACTIVE"
    ? <span className="badge-success">Active</span>
    : <span className="badge-neutral">Inactive</span>
}

export function CitiesListTable({ result, page, countrySlug, status, search, countryStatus, canWrite }: Props) {
  if (!result || result.cities.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No cities yet"
        description={
          countryStatus === "ACTIVE"
            ? "Add the first city to start onboarding vendors here."
            : "Activate this country before adding cities."
        }
      />
    )
  }

  return (
    <div className="admin-card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs uppercase tracking-wide">City</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Timezone</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Coordinates</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.cities.map((city) => (
              <TableRow key={city.id} className="hover:bg-muted/10">
                <TableCell>
                  <Link href={`/cities/${city.slug}`} className="group flex items-center gap-3">
                    <div className="icon-badge icon-badge-primary h-9 w-9 shrink-0">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground transition-colors group-hover:text-primary">
                        {city.name}
                      </p>
                      {city.code && <p className="truncate text-xs text-muted-foreground">{city.code}</p>}
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                  {city.timezone}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {city.latitude != null && city.longitude != null
                    ? `${city.latitude.toFixed(3)}, ${city.longitude.toFixed(3)}`
                    : "—"}
                </TableCell>
                <TableCell><StatusBadge status={city.status} /></TableCell>
                <TableCell className="text-right">
                  <CityActions city={city} canWrite={canWrite} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        total={result.total}
        page={page}
        totalPages={result.totalPages}
        basePath="/cities"
        params={{ country: countrySlug, status, ...(search ? { search } : {}) }}
        itemLabel="cities"
      />
    </div>
  )
}
