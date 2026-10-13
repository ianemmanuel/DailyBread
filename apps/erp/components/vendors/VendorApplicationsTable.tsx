import Link                      from "next/link"
import { ArrowUpDown, ArrowUp, ArrowDown, ArrowRight, Inbox } from "lucide-react"
import { Button }                from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { VendorApplicationStatusBadge } from "@/components/vendors/VendorApplicationStatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { TablePagination } from "@/components/shared/TablePagination"
import { getInitials } from "@/lib/initials"
import type { ApplicationListResult } from "@/types"

interface Props {
  result    : ApplicationListResult | null
  page      : string
  search    : string
  status    : string
  sort      : string
  dir       : string
  /** VENDORS_APPLICATIONS_REVIEW — the base capability to open and act on an application */
  canReview : boolean
  /** Defaults to /vendors/applications — set on /countries/[slug]/vendor-applications */
  basePath? : string
  /** Preserved across sort/pagination links when set (country-scoped page) */
  countryId?: string
  /** Country FILTER value (a slug) on the global /vendors/applications list — distinct from countryId above, which is the fixed country of a country-drilldown page */
  country?  : string
  /** Operational queue filter ("mine" | "unassigned" | "escalated") — preserved across sort/pagination */
  queue?    : string
}

export function VendorApplicationsTable({
  result, page, search, status, sort, dir, canReview, basePath = "/vendors/applications", countryId, country, queue,
}: Props) {
  const baseParams = {
    page: "1", search, status, sort, dir,
    ...(countryId ? { countryId } : {}),
    ...(country   ? { country }   : {}),
    ...(queue     ? { queue }     : {}),
  }

  function buildHref(params: Record<string, string>) {
    return `${basePath}?${new URLSearchParams(params).toString()}`
  }

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
      <EmptyState
        icon={Inbox}
        title="No applications found"
        description="Try adjusting your search or filter criteria."
      />
    )
  }

  return (
    <div className="admin-card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 bg-muted/40 hover:bg-muted/40">
              <TableHead className="py-3">
                <Link href={sortHref("legalBusinessName")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
                  Business <SortIcon column="legalBusinessName" />
                </Link>
              </TableHead>
              <TableHead className="hidden text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell">
                Type &amp; Country
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
              <TableHead className="hidden text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">
                <Link href={sortHref("submittedAt")} className="inline-flex items-center hover:text-foreground">
                  Submitted <SortIcon column="submittedAt" />
                </Link>
              </TableHead>
              {canReview && <TableHead className="w-px" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.applications.map((app) => (
              <TableRow key={app.id} className="group border-border/50 hover:bg-muted/20">
                <TableCell className="py-3.5">
                  <Link href={`/vendors/applications/${app.id}`} className="flex items-center gap-3">
                    <div className="avatar-circle h-9 w-9 text-xs">
                      {getInitials(app.legalBusinessName)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground transition-colors group-hover:text-primary">
                        {app.legalBusinessName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{app.businessEmail}</p>
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <p className="text-sm text-foreground">{app.vendorType?.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{app.country?.name ?? "—"}</p>
                </TableCell>
                <TableCell>
                  <VendorApplicationStatusBadge status={app.status} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}
                  </span>
                </TableCell>
                {canReview && (
                  <TableCell className="text-right">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="gap-1 rounded-full border-border/70 bg-card text-xs text-foreground shadow-[var(--shadow-xs)] transition-all hover:-translate-y-px hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                    >
                      <Link href={`/vendors/applications/${app.id}`} aria-label={`Review ${app.legalBusinessName}`}>
                        Review
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </TableCell>
                )}
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
        params={{
          search, status, sort, dir,
          ...(countryId ? { countryId } : {}),
          ...(country   ? { country }   : {}),
          ...(queue     ? { queue }     : {}),
        }}
        itemLabel="applications"
      />
    </div>
  )
}
