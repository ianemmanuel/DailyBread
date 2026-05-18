"use client"

import { useState } from "react"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@repo/ui/components/pagination"
import { CountryCard } from "./CountryCard"
import type { CountrySummaryResult } from "@/types/geography.types"

interface CountryGridProps {
  countries: CountrySummaryResult[]
  pageSize?: number
}

export function CountryGrid({ countries, pageSize = 9 }: CountryGridProps) {
  const [page, setPage] = useState(1)

  const totalPages = Math.ceil(countries.length / pageSize)
  const start      = (page - 1) * pageSize
  const paginated  = countries.slice(start, start + pageSize)

  function getPageNumbers(): (number | "ellipsis")[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages: (number | "ellipsis")[] = [1]
    if (page > 3)              pages.push("ellipsis")
    const lo = Math.max(2, page - 1)
    const hi = Math.min(totalPages - 1, page + 1)
    for (let i = lo; i <= hi; i++) pages.push(i)
    if (page < totalPages - 2) pages.push("ellipsis")
    pages.push(totalPages)
    return pages
  }

  return (
    <div className="space-y-5">
      {/* Header row: result count + active/inactive breakdown */}
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Showing{" "}
          <span className="font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>
            {start + 1}–{Math.min(start + pageSize, countries.length)}
          </span>{" "}
          of{" "}
          <span className="font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>
            {countries.length}
          </span>{" "}
          {countries.length === 1 ? "country" : "countries"}
        </p>
      </div>

      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {paginated.map((country) => (
          <CountryCard key={country.id} country={country} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center pt-1">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)) }}
                  aria-disabled={page === 1}
                  className={page === 1 ? "pointer-events-none opacity-40" : ""}
                />
              </PaginationItem>

              {getPageNumbers().map((num, idx) =>
                num === "ellipsis" ? (
                  <PaginationItem key={`ellipsis-${idx}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={num}>
                    <PaginationLink
                      href="#"
                      isActive={num === page}
                      onClick={(e) => { e.preventDefault(); setPage(num) }}
                    >
                      {num}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPages, p + 1)) }}
                  aria-disabled={page === totalPages}
                  className={page === totalPages ? "pointer-events-none opacity-40" : ""}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  )
}