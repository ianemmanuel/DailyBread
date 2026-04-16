import Link                      from "next/link"
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { Button }                from "@repo/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import { VendorApplicationStatusBadge } from "@/components/vendors/VendorApplicationStatusBadge"
import type { ApplicationListResult } from "@/types"  

interface Props {
  result     : ApplicationListResult | null
  page       : string
  search     : string
  status     : string
  sort       : string
  dir        : string
  canApprove : boolean
}

function buildHref(params: Record<string, string>) {
  return `/vendors/applications?${new URLSearchParams(params).toString()}`
}

export function VendorApplicationsTable({
  result, page, search, status, sort, dir, canApprove,
}: Props) {
  const baseParams = { page: "1", search, status, sort, dir }

  function sortHref(column: string) {
    const newDir = sort === column && dir === "desc" ? "asc" : "desc"
    return buildHref({ ...baseParams, sort: column, dir: newDir, page: "1" })
  }

  function SortIcon({ column }: { column: string }) {
    if (sort !== column) return <ArrowUpDown className="ml-1.5 h-3 w-3 opacity-40" />
    return dir === "asc"
      ? <ArrowUp   className="ml-1.5 h-3 w-3 text-primary" />
      : <ArrowDown className="ml-1.5 h-3 w-3 text-primary" />
  }

  if (!result || result.applications.length === 0) {
    return (
      <div className="admin-card flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm font-medium text-foreground">No applications found</p>
        <p className="mt-1 text-xs text-muted-foreground">Try adjusting your search or filter criteria.</p>
      </div>
    )
  }

  return (
    <div className="admin-card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>
                <Link href={sortHref("legalBusinessName")} className="inline-flex items-center text-xs uppercase tracking-wide hover:text-foreground">
                  Business <SortIcon column="legalBusinessName" />
                </Link>
              </TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Type</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Country</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide lg:table-cell">
                <Link href={sortHref("submittedAt")} className="inline-flex items-center hover:text-foreground">
                  Submitted <SortIcon column="submittedAt" />
                </Link>
              </TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide xl:table-cell">
                <Link href={sortHref("createdAt")} className="inline-flex items-center hover:text-foreground">
                  Created <SortIcon column="createdAt" />
                </Link>
              </TableHead>
              {canApprove && (
                <TableHead className="text-right text-xs uppercase tracking-wide">Review</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.applications.map((app) => (
              <TableRow key={app.id} className="hover:bg-muted/10">
                <TableCell>
                  <Link href={`/vendors/applications/${app.id}`} className="group block">
                    <p className="font-medium text-foreground transition-colors group-hover:text-primary">
                      {app.legalBusinessName}
                    </p>
                    <p className="text-xs text-muted-foreground">{app.businessEmail}</p>
                  </Link>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span className="text-sm text-muted-foreground">{app.vendorType?.name ?? "—"}</span>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className="text-sm text-muted-foreground">{app.country?.name ?? "—"}</span>
                </TableCell>
                <TableCell>
                  <VendorApplicationStatusBadge status={app.status} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="font-mono text-xs text-muted-foreground">
                    {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : "—"}
                  </span>
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(app.createdAt).toLocaleDateString()}
                  </span>
                </TableCell>
                {canApprove && (
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/vendors/applications/${app.id}`}>Review</Link>
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {result.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
          <p className="text-xs text-muted-foreground">{result.total} applications</p>
          <div className="flex items-center gap-2">
            {parseInt(page) > 1 && (
              <Button asChild variant="ghost" size="sm">
                <Link href={buildHref({ ...baseParams, page: String(parseInt(page) - 1) })}>Previous</Link>
              </Button>
            )}
            <span className="text-xs text-muted-foreground">Page {page} of {result.totalPages}</span>
            {parseInt(page) < result.totalPages && (
              <Button asChild variant="ghost" size="sm">
                <Link href={buildHref({ ...baseParams, page: String(parseInt(page) + 1) })}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}