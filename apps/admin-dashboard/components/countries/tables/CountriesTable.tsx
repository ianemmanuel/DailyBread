"use client"

import { useState, useMemo } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
} from "@tanstack/react-table"
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import { cn } from "@repo/ui/lib/utils"
import { columns } from "./columns"
import type { CountrySummaryResult } from "@/types/geography.types"

interface CountriesTableProps {
  countries: CountrySummaryResult[]
  /** Maximum rows per page. Default: 8 */
  pageSize?: number
}

export function CountriesTable({ countries, pageSize = 8 }: CountriesTableProps) {
  const [sorting, setSorting]   = useState<SortingState>([])
  const [search, setSearch]     = useState("")
  const [page, setPage]         = useState(1)

  /* ── Client-side search filter ───────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return countries
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.region ?? "").toLowerCase().includes(q),
    )
  }, [countries, search])

  /* ── Pagination ──────────────────────────────────────────── */
  const totalPages  = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage    = Math.min(page, totalPages)
  const start       = (safePage - 1) * pageSize
  const paginated   = filtered.slice(start, start + pageSize)

  /* ── Table instance ──────────────────────────────────────── */
  const table = useReactTable({
    data:             paginated,
    columns,
    state:            { sorting },
    onSortingChange:  setSorting,
    getCoreRowModel:  getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,   // we handle pagination ourselves
  })

  /* ── Page number chips ───────────────────────────────────── */
  function pageChips(): (number | "…")[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const out: (number | "…")[] = [1]
    if (safePage > 3) out.push("…")
    const lo = Math.max(2, safePage - 1)
    const hi = Math.min(totalPages - 1, safePage + 1)
    for (let i = lo; i <= hi; i++) out.push(i)
    if (safePage < totalPages - 2) out.push("…")
    out.push(totalPages)
    return out
  }

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card">
      {/* ── Header bar ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <h2 className="font-display text-base font-semibold text-foreground">
            Active Countries
          </h2>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-primary/12 px-1.5 text-[11px] font-bold tabular-nums text-primary">
            {filtered.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search countries..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="h-8 w-48 pl-8 text-sm placeholder:text-muted-foreground focus-visible:ring-primary/40 sm:w-56"
            />
          </div>
          {/* Filter */}
          <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-xs text-muted-foreground hover:text-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filter
          </Button>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="border-b border-border hover:bg-transparent">
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="h-10 px-4 text-left first:pl-5 last:pr-5"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  {search ? `No countries match "${search}"` : "No countries found."}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-b border-border/60 transition-colors hover:bg-muted/40 last:border-0"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="px-4 py-3 first:pl-5 last:pr-5"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Footer: count + pagination ───────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">
          Showing{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {filtered.length === 0 ? 0 : start + 1}–{Math.min(start + pageSize, filtered.length)}
          </span>{" "}
          of{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {filtered.length}
          </span>{" "}
          {filtered.length === 1 ? "country" : "countries"}
        </p>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-40"
              disabled={safePage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {pageChips().map((chip, idx) =>
              chip === "…" ? (
                <span
                  key={`ellipsis-${idx}`}
                  className="flex h-7 w-7 items-center justify-center text-xs text-muted-foreground"
                >
                  …
                </span>
              ) : (
                <button
                  key={chip}
                  onClick={() => setPage(chip)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium transition-colors",
                    chip === safePage
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {chip}
                </button>
              ),
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-40"
              disabled={safePage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}