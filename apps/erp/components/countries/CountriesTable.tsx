import Link from "next/link"
import { Flag, Building2, Store, Tag, FileText, ArrowRight } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/shared/EmptyState"
import { CountryActions } from "@/components/countries/CountryActions"
import { TablePagination } from "@/components/shared/TablePagination"
import type { CountrySummaryResult } from "@repo/types/admin-app"

interface PaginationProps {
  total     : number
  page      : string | number
  totalPages: number
  basePath  : string
  params?   : Record<string, string>
}

interface Props {
  countries: CountrySummaryResult[]
  canWrite?: boolean
  isGlobal?: boolean
  /** Hides the Actions column entirely — used on the analytics home, where activation lives on its own page. */
  readOnly?: boolean
  /**
   * "queue" — used by the launch-queue page (/countries/activation): swaps
   * Currency/Vendors for checklist progress (vendor types / doc types
   * linked), and swaps the Actions column for a plain "View details" link
   * instead of an inline Activate button — activation only happens from
   * the country's own detail page now.
   */
  variant?: "default" | "queue"
  /** Renders the shared Prev/Next footer inside the same card when provided. */
  pagination?: PaginationProps
}

function StatusBadge({ status }: { status: string }) {
  return status === "ACTIVE"
    ? <span className="badge-success">Active</span>
    : <span className="badge-neutral">Inactive</span>
}

export function CountriesTable({ countries, canWrite = false, isGlobal = false, readOnly = false, variant = "default", pagination }: Props) {
  const isQueue = variant === "queue"
  // The plain read-only table (the /countries home page — always active
  // countries only) doesn't need Region/Vendors/Status columns: status is
  // implied (every row is active), and vendors/region belong on the
  // country's own detail page, one click away via "View details."
  const isHome = !isQueue && readOnly
  if (countries.length === 0) {
    return (
      <EmptyState
        icon={Flag}
        title="No countries found"
        description="Try adjusting your filter, or check with a super admin about seeding new countries."
      />
    )
  }

  return (
    <div className="admin-card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs uppercase tracking-wide">Country</TableHead>
              {isQueue ? (
                <>
                  <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Vendor Types</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Doc Types</TableHead>
                </>
              ) : (
                <>
                  <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Currency</TableHead>
                  {!isHome && <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Region</TableHead>}
                </>
              )}
              <TableHead className="text-xs uppercase tracking-wide">Cities</TableHead>
              {!isQueue && !isHome && <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Vendors</TableHead>}
              {!isHome && <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>}
              {(!readOnly || isQueue || isHome) && <TableHead className="text-right text-xs uppercase tracking-wide">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {countries.map((country) => (
              <TableRow key={country.id} className="hover:bg-muted/10">
                <TableCell>
                  <Link href={`/countries/${country.slug}`} className="group flex items-center gap-3">
                    <div className="icon-badge icon-badge-primary h-9 w-9">
                      <Flag className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground transition-colors group-hover:text-primary">
                        {country.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{country.code} · {country.phoneCode}</p>
                    </div>
                  </Link>
                </TableCell>
                {isQueue ? (
                  <>
                    <TableCell className="hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        {country._count.vendorTypes}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        {country._count.documentTypes}
                      </span>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {country.currency}
                    </TableCell>
                    {!isHome && (
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {country.region?.name ?? "—"}
                      </TableCell>
                    )}
                  </>
                )}
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {country._count.cities}
                  </span>
                </TableCell>
                {!isQueue && !isHome && (
                  <TableCell className="hidden sm:table-cell">
                    <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                      <Store className="h-3.5 w-3.5 text-muted-foreground" />
                      {country._count.vendors}
                    </span>
                  </TableCell>
                )}
                {!isHome && <TableCell><StatusBadge status={country.status} /></TableCell>}
                {isQueue || isHome ? (
                  <TableCell className="text-right">
                    <Link
                      href={`/countries/${country.slug}`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      View details
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </TableCell>
                ) : !readOnly && (
                  <TableCell className="text-right">
                    <CountryActions
                      countrySlug={country.slug}
                      countryName={country.name}
                      status={country.status}
                      canWrite={canWrite}
                      isGlobal={isGlobal}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pagination && (
        <TablePagination
          total={pagination.total}
          page={pagination.page}
          totalPages={pagination.totalPages}
          basePath={pagination.basePath}
          params={pagination.params}
          itemLabel="countries"
        />
      )}
    </div>
  )
}
