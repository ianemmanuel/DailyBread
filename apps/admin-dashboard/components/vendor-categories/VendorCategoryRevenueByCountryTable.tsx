"use client"

import { useState } from "react"
import { Globe2 } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination"
import { EmptyState } from "@/components/shared/EmptyState"
import { formatMockCurrency } from "@/lib/mock/country-revenue"
import type { MockCountryRevenueRow } from "@/lib/mock/vendor-type-revenue"

interface Props {
  rows: MockCountryRevenueRow[]
}

const PAGE_SIZE = 10

/**
 * Global-scope only — ranks every active country by one category's mock
 * revenue. Paginated client-side: the row count is bounded by the number
 * of countries in the system (never large), and the data is already
 * static/mock, so a real server round-trip would add nothing.
 */
export function VendorCategoryRevenueByCountryTable({ rows }: Props) {
  const [page, setPage] = useState(1)

  if (rows.length === 0) {
    return <EmptyState icon={Globe2} title="No countries available" description="Revenue by country will appear here once countries are active." />
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageItems = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const startRank = (page - 1) * PAGE_SIZE

  return (
    <div className="admin-card overflow-hidden p-0">
      <div className="border-b border-border/60 px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">Revenue by Country</h2>
        <p className="text-xs text-muted-foreground">Illustrative — ranked highest to lowest.</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-12 text-xs uppercase tracking-wide">#</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Country</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.map((row, i) => (
              <TableRow key={row.country.slug} className="hover:bg-muted/10">
                <TableCell className="font-mono text-xs text-muted-foreground">{startRank + i + 1}</TableCell>
                <TableCell className="font-medium text-foreground">{row.country.name}</TableCell>
                <TableCell className="text-right font-mono text-sm text-foreground">{formatMockCurrency(row.revenue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="border-t border-border/60 px-5 py-3">
          <Pagination className="justify-start">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  size="sm"
                  onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1) }}
                  className={page <= 1 ? "pointer-events-none opacity-40" : ""}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <PaginationItem key={p}>
                  <PaginationLink href="#" size="icon" isActive={p === page} onClick={(e) => { e.preventDefault(); setPage(p) }}>
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  size="sm"
                  onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(page + 1) }}
                  className={page >= totalPages ? "pointer-events-none opacity-40" : ""}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  )
}
