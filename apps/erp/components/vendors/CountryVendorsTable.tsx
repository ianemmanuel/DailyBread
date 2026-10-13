import Link from "next/link"
import { Store, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
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
import { getInitials } from "@/lib/initials"
import type { VendorListResult } from "@/types"

interface Props {
  result  : VendorListResult | null
  page    : string
  search  : string
  status  : string
  sort    : string
  dir     : string
  basePath: string
  emptyTitle: string
  emptyDescription: string
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    ACTIVE   : "badge-success",
    SUSPENDED: "badge-warning",
    BANNED   : "badge-danger",
  }
  const label: Record<string, string> = {
    ACTIVE   : "Active",
    SUSPENDED: "Suspended",
    BANNED   : "Banned",
  }
  return <span className={cls[status] ?? "badge-neutral"}>{label[status] ?? status}</span>
}

/**
 * Country-scoped vendor accounts table — used by /countries/[slug]/vendors
 * and its /suspended, /banned sub-views. Same shape as VendorAccountsTable
 * but with a configurable basePath, sortable columns, and a correct
 * isBanned-aware status badge.
 */
export function CountryVendorsTable({ result, page, search, status, sort, dir, basePath, emptyTitle, emptyDescription }: Props) {
  const baseParams = { page: "1", search, status, sort, dir }

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

  if (!result || result.accounts.length === 0) {
    return <EmptyState icon={Store} title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className="admin-card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs uppercase tracking-wide">
                <Link href={sortHref("legalBusinessName")} className="inline-flex items-center hover:text-foreground">
                  Business <SortIcon column="legalBusinessName" />
                </Link>
              </TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Type</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">
                <Link href={sortHref("status")} className="inline-flex items-center hover:text-foreground">
                  Status <SortIcon column="status" />
                </Link>
              </TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide lg:table-cell">
                <Link href={sortHref("createdAt")} className="inline-flex items-center hover:text-foreground">
                  Joined <SortIcon column="createdAt" />
                </Link>
              </TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.accounts.map((acc) => (
              <TableRow key={acc.id} className="hover:bg-muted/10">
                <TableCell>
                  <Link href={`/vendors/accounts/${acc.id}`} className="group flex items-center gap-3">
                    <div className="avatar-circle h-9 w-9 text-xs">
                      {getInitials(acc.legalBusinessName)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground transition-colors group-hover:text-primary">
                        {acc.legalBusinessName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{acc.businessEmail}</p>
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                  {acc.vendorType?.name ?? "—"}
                </TableCell>
                <TableCell><StatusBadge status={acc.user?.isBanned ? "BANNED" : acc.status} /></TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(acc.createdAt).toLocaleDateString()}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm" className="rounded-full">
                    <Link href={`/vendors/accounts/${acc.id}`}>View</Link>
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
        params={{
          ...(search ? { search } : {}),
          ...(status ? { status } : {}),
          sort,
          dir,
        }}
        itemLabel="vendors"
      />
    </div>
  )
}
