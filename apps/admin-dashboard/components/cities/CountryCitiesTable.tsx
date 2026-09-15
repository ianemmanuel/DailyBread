import Link from "next/link"
import { Building2, MapPin, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import { TablePagination } from "@/components/shared/TablePagination"
import type { CityListResult } from "@/types/city.types"

interface Props {
  result  : CityListResult | null
  page    : string
  search  : string
  sort    : string
  dir     : string
  basePath: string
}

function StatusBadge({ status }: { status: string }) {
  return status === "ACTIVE"
    ? <span className="badge-success">Active</span>
    : <span className="badge-neutral">Deactivated</span>
}

/**
 * Country-scoped cities table — every city (active + deactivated) in one
 * sortable, paginated table. Actions are just a "See more" link to the
 * city's own detail page, where the real edit/activate/deactivate controls
 * live (CityActions) — keeps this index browsable, not congested.
 */
export function CountryCitiesTable({ result, page, search, sort, dir, basePath }: Props) {
  const baseParams = { page: "1", search, sort, dir }

  function sortHref(column: string) {
    const newDir = sort === column && dir === "desc" ? "asc" : "desc"
    return `${basePath}?${new URLSearchParams({ ...baseParams, sort: column, dir: newDir }).toString()}`
  }

  function SortIcon({ column }: { column: string }) {
    if (sort !== column) return <ArrowUpDown className="ml-1.5 h-3 w-3 opacity-40" />
    return dir === "asc"
      ? <ArrowUp   className="ml-1.5 h-3 w-3 text-primary" />
      : <ArrowDown className="ml-1.5 h-3 w-3 text-primary" />
  }

  if (!result || result.cities.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No cities yet"
        description="Add the first city to start onboarding vendors here."
      />
    )
  }

  return (
    <div className="admin-card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs uppercase tracking-wide">
                <Link href={sortHref("name")} className="inline-flex items-center hover:text-foreground">
                  City <SortIcon column="name" />
                </Link>
              </TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Timezone</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">
                <Link href={sortHref("outletCount")} className="inline-flex items-center hover:text-foreground">
                  Outlets <SortIcon column="outletCount" />
                </Link>
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide">
                <Link href={sortHref("status")} className="inline-flex items-center hover:text-foreground">
                  Status <SortIcon column="status" />
                </Link>
              </TableHead>
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
                <TableCell className="text-sm tabular-nums text-foreground">
                  {(city.outletCount ?? 0).toLocaleString()}
                </TableCell>
                <TableCell><StatusBadge status={city.status} /></TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm" className="rounded-full">
                    <Link href={`/cities/${city.slug}`}>See more</Link>
                  </Button>
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
        basePath={basePath}
        params={{ ...(search ? { search } : {}), sort, dir }}
        itemLabel="cities"
      />
    </div>
  )
}
