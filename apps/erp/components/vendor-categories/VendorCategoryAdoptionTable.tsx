"use client"

import { useState } from "react"
import Link from "next/link"
import { Tag } from "lucide-react"
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
import type { VendorTypeAdoptionResult } from "@/types/vendor-type.types"

interface Props {
  data: VendorTypeAdoptionResult
}

const PAGE_SIZE = 10

/**
 * Full ranking, real data — every active category with a vendor in scope,
 * not just the top 5 shown in the donut above it. Client-paginated for the
 * same reason as VendorCategoryRevenueByCountryTable: the row count is
 * bounded (categories, like countries, are never a large list) so a real
 * server round-trip buys nothing.
 */
export function VendorCategoryAdoptionTable({ data }: Props) {
  const [page, setPage] = useState(1)
  const rows = data.items.filter((i) => i.vendorType)

  if (rows.length === 0) {
    return <EmptyState icon={Tag} title="No vendors yet" description="Adoption will appear here once vendors are onboarded." />
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageItems = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const startRank = (page - 1) * PAGE_SIZE

  return (
    <div className="admin-card overflow-hidden p-0">
      <div className="border-b border-border/60 px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">All Categories</h2>
        <p className="text-xs text-muted-foreground">Ranked by vendor count, highest to lowest.</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-12 text-xs uppercase tracking-wide">#</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Category</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Vendors</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.map((row, i) => (
              <TableRow key={row.vendorType!.id} className="hover:bg-muted/10">
                <TableCell className="font-mono text-xs text-muted-foreground">{startRank + i + 1}</TableCell>
                <TableCell>
                  <Link href={`/vendor-categories/${row.vendorType!.slug}`} className="font-medium text-foreground hover:text-primary">
                    {row.vendorType!.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-foreground">{row.count.toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">{row.percentage}%</TableCell>
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
