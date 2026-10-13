import { Ban } from "lucide-react"
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

interface Props {
  result     : CityListResult | null
  page       : string
  countrySlug: string
  search     : string
  basePath   : string
  canWrite   : boolean
}

export function DeactivatedCitiesTable({ result, page, countrySlug, search, basePath, canWrite }: Props) {
  if (!result || result.cities.length === 0) {
    return (
      <EmptyState
        icon={Ban}
        title="No deactivated cities"
        description="Cities that get deactivated in this country will show up here, with who did it, when, and why."
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
              <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Deactivated by</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Deactivated at</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Reason</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.cities.map((city) => (
              <TableRow key={city.id} className="hover:bg-muted/10">
                <TableCell className="font-medium text-foreground">{city.name}</TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                  {city.deactivatedByName ?? "—"}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                  {city.deactivatedAt ? new Date(city.deactivatedAt).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell className="max-w-xs truncate text-sm text-muted-foreground" title={city.deactivationReason ?? undefined}>
                  {city.deactivationReason ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <CityActions city={city} canWrite={canWrite} countryRef={countrySlug} />
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
        params={search ? { search } : {}}
        itemLabel="deactivated cities"
      />
    </div>
  )
}
