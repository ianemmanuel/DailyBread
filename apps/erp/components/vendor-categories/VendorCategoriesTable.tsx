import Link from "next/link"
import { Tag, Globe2 } from "lucide-react"
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
import { VendorCategoryStatusBadge } from "./VendorCategoryStatusBadge"
import type { VendorTypeListResult } from "@/types/vendor-type.types"

interface Props {
  result  : VendorTypeListResult | null
  page    : string
  search  : string
  status  : string
  country : string
}

/**
 * Server-side paginated — the backend already does real skip/take
 * (listVendorTypes), this just renders one page of results and lets
 * TablePagination build the next/prev links. Trimmed for the list view —
 * description and the inline activate/suspend action both live on the
 * detail page (/vendor-categories/[slug]).
 */
export function VendorCategoriesTable({ result, page, search, status, country }: Props) {
  if (!result || result.vendorTypes.length === 0) {
    return (
      <EmptyState
        icon={Tag}
        title="No vendor categories found"
        description="Try adjusting your search or filter criteria."
      />
    )
  }

  return (
    <div className="admin-card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs uppercase tracking-wide">Name</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Countries</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Manage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.vendorTypes.map((vt) => (
              <TableRow key={vt.id} className="hover:bg-muted/10">
                <TableCell>
                  <Link href={`/vendor-categories/${vt.slug}`} className="group flex items-center gap-3">
                    <div className="icon-badge icon-badge-primary h-9 w-9 shrink-0">
                      <Tag className="h-4 w-4" />
                    </div>
                    <span className="font-medium text-foreground transition-colors group-hover:text-primary">
                      {vt.name}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Globe2 className="h-3.5 w-3.5" />
                    {vt._count.countries}
                  </span>
                </TableCell>
                <TableCell><VendorCategoryStatusBadge status={vt.status} /></TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm" className="rounded-full">
                    <Link href={`/vendor-categories/${vt.slug}`}>Manage</Link>
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
        basePath="/vendor-categories"
        params={{
          ...(search  ? { search }  : {}),
          ...(status  ? { status }  : {}),
          ...(country ? { country } : {}),
        }}
        itemLabel="vendor categories"
      />
    </div>
  )
}
