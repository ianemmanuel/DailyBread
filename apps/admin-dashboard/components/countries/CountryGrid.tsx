"use client"

import { useState } from "react"
import { Globe } from "lucide-react"
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
import type { Country } from "@repo/types/admin-app"

interface CountryGridProps {
  countries: Country[]
  pageSize?: number
}

export function CountryGrid({ countries, pageSize = 9 }: CountryGridProps) {
  const [page, setPage] = useState(1)

  const totalPages  = Math.ceil(countries.length / pageSize)
  const start       = (page - 1) * pageSize
  const paginated   = countries.slice(start, start + pageSize)

  /* Build visible page numbers with ellipsis */
  function getPageNumbers(): (number | "ellipsis")[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)

    const pages: (number | "ellipsis")[] = [1]
    if (page > 3)           pages.push("ellipsis")
    const lo = Math.max(2, page - 1)
    const hi = Math.min(totalPages - 1, page + 1)
    for (let i = lo; i <= hi; i++) pages.push(i)
    if (page < totalPages - 2) pages.push("ellipsis")
    pages.push(totalPages)
    return pages
  }

  /* ── Empty state ──────────────────────────────────────────── */
  if (countries.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-xl border py-24 text-center"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--muted)" }}
        >
          <Globe className="h-7 w-7" style={{ color: "var(--muted-foreground)" }} />
        </div>
        <div>
          <p className="font-semibold" style={{ color: "var(--foreground)" }}>
            No countries configured
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Contact your administrator to activate a country.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Result count ────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Showing{" "}
          <span className="font-medium tabular-nums" style={{ color: "var(--foreground)" }}>
            {start + 1}–{Math.min(start + pageSize, countries.length)}
          </span>{" "}
          of{" "}
          <span className="font-medium tabular-nums" style={{ color: "var(--foreground)" }}>
            {countries.length}
          </span>{" "}
          {countries.length === 1 ? "country" : "countries"}
        </p>
      </div>

      {/* ── Grid ────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {paginated.map((country) => (
          <CountryCard key={country.id} country={country} />
        ))}
      </div>

      {/* ── Pagination ──────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex justify-center pt-2">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setPage((p) => Math.max(1, p - 1))
                  }}
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
                      onClick={(e) => {
                        e.preventDefault()
                        setPage(num)
                      }}
                    >
                      {num}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setPage((p) => Math.min(totalPages, p + 1))
                  }}
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