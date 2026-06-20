"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, MoreHorizontal, Globe, Search, SlidersHorizontal } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import { Button } from "@repo/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu"
import type { CountrySummaryResult } from "@/types/geography.types"

interface CountryTableProps {
  countries: CountrySummaryResult[]
  pageSize?: number
}

/** Maps a 2-letter ISO code to a flag emoji */
function countryFlag(code: string): string {
  // Convert ISO 3166-1 alpha-2 to regional indicator symbols
  const upper = code.toUpperCase().slice(0, 2)
  const points = [...upper].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  return String.fromCodePoint(...points)
}

/** Derive a rough region from country code — placeholder until backend sends region */
function deriveRegion(code: string): string {
  const eastAfrica  = ["KE", "UG", "TZ", "RW", "ET", "BI", "SS", "DJ", "ER", "SO", "MW", "ZM", "MZ"]
  const westAfrica  = ["NG", "GH", "SN", "CI", "CM", "BJ", "TG", "BF", "ML", "NE", "MR", "SL", "LR", "GN"]
  const southAfrica = ["ZA", "NA", "BW", "LS", "SZ", "ZW", "AO"]
  const northAfrica = ["EG", "MA", "DZ", "TN", "LY", "SD"]
  const middleEast  = ["AE", "SA", "QA", "KW", "BH", "OM", "JO", "LB"]

  const c = code.toUpperCase()
  if (eastAfrica.includes(c))  return "East Africa"
  if (westAfrica.includes(c))  return "West Africa"
  if (southAfrica.includes(c)) return "Southern Africa"
  if (northAfrica.includes(c)) return "North Africa"
  if (middleEast.includes(c))  return "Middle East"
  return "Other"
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "ACTIVE"
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none"
      style={{
        backgroundColor: isActive ? "var(--success-bg)" : "var(--muted)",
        color:           isActive ? "var(--success)"    : "var(--muted-foreground)",
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: isActive ? "var(--success)" : "var(--muted-foreground)" }}
      />
      {isActive ? "Active" : "Inactive"}
    </span>
  )
}

export function CountryTable({ countries, pageSize = 8 }: CountryTableProps) {
  const [currentPage, setCurrentPage]   = useState(1)
  const [searchQuery, setSearchQuery]   = useState("")

  const filtered = countries.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const totalPages = Math.ceil(filtered.length / pageSize)
  const start      = (currentPage - 1) * pageSize
  const visible    = filtered.slice(start, start + pageSize)

  const goTo = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalPages)))

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
    >
      {/* Table toolbar */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--foreground)" }}
          >
            Active Countries
          </span>
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums"
            style={{
              backgroundColor: "color-mix(in oklch, var(--primary) 12%, transparent)",
              color: "var(--primary)",
            }}
          >
            {countries.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative hidden sm:block">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
              style={{ color: "var(--muted-foreground)" }}
            />
            <input
              type="search"
              placeholder="Search countries..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
              className={[
                "h-8 w-48 rounded-lg border pl-8 pr-3 text-xs outline-none",
                "transition-colors duration-150",
                "bg-[var(--input)] border-[var(--input-border)]",
                "focus:border-[var(--ring)] focus:ring-1 focus:ring-[var(--ring)]",
                "placeholder:text-[var(--input-placeholder)]",
                "text-[var(--foreground)]",
              ].join(" ")}
            />
          </div>
          {/* Filter button */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filter</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: "var(--border)" }}>
              <TableHead
                className="text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--muted-foreground)" }}
              >
                Country
              </TableHead>
              <TableHead
                className="text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--muted-foreground)" }}
              >
                Region
              </TableHead>
              <TableHead
                className="text-right text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--muted-foreground)" }}
              >
                Cities
              </TableHead>
              <TableHead
                className="text-right text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--muted-foreground)" }}
              >
                Vendors
              </TableHead>
              <TableHead
                className="text-right text-[11px] font-semibold uppercase tracking-wide hidden md:table-cell"
                style={{ color: "var(--muted-foreground)" }}
              >
                Orders (30d)
              </TableHead>
              <TableHead
                className="text-right text-[11px] font-semibold uppercase tracking-wide hidden lg:table-cell"
                style={{ color: "var(--muted-foreground)" }}
              >
                GMV (30d)
              </TableHead>
              <TableHead
                className="text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--muted-foreground)" }}
              >
                Status
              </TableHead>
              <TableHead className="w-24 text-[11px] font-semibold uppercase tracking-wide text-right"
                style={{ color: "var(--muted-foreground)" }}
              >
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Globe className="h-8 w-8" style={{ color: "var(--muted-foreground)" }} />
                    <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                      {searchQuery ? "No countries match your search" : "No countries found"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              visible.map((country) => (
                <TableRow
                  key={country.id}
                  className="group transition-colors duration-100"
                  style={{ borderColor: "var(--border)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--accent)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = ""
                  }}
                >
                  {/* Country */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span
                        className="text-xl leading-none select-none"
                        aria-hidden="true"
                      >
                        {countryFlag(country.code)}
                      </span>
                      <div>
                        <p
                          className="text-sm font-semibold leading-tight"
                          style={{ color: "var(--foreground)" }}
                        >
                          {country.name}
                        </p>
                        <p
                          className="text-[11px] font-mono leading-tight"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {country.code}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  {/* Region */}
                  <TableCell>
                    <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                      {deriveRegion(country.code)}
                    </span>
                  </TableCell>

                  {/* Cities */}
                  <TableCell className="text-right">
                    <span
                      className="font-display text-sm font-semibold tabular-nums"
                      style={{ color: "var(--foreground)" }}
                    >
                      {country._count.cities.toLocaleString()}
                    </span>
                  </TableCell>

                  {/* Vendors */}
                  <TableCell className="text-right">
                    <span
                      className="font-display text-sm font-semibold tabular-nums"
                      style={{ color: "var(--foreground)" }}
                    >
                      {country._count.vendors.toLocaleString()}
                    </span>
                  </TableCell>

                  {/* Orders (30d) — static placeholder */}
                  <TableCell className="text-right hidden md:table-cell">
                    <span
                      className="text-sm tabular-nums"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      —
                    </span>
                  </TableCell>

                  {/* GMV (30d) — static placeholder */}
                  <TableCell className="text-right hidden lg:table-cell">
                    <span
                      className="text-sm tabular-nums"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      —
                    </span>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <StatusBadge status={country.status} />
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/countries/${country.slug}`}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-3 text-xs"
                        >
                          View
                        </Button>
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="More actions"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem asChild>
                            <Link href={`/countries/${country.slug}`}>View details</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/countries/${country.slug}/cities`}>Manage cities</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/countries/${country.slug}/vendors`}>View vendors</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                          >
                            Deactivate country
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          className="flex items-center justify-between border-t px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Showing {start + 1}–{Math.min(start + pageSize, filtered.length)} of{" "}
            {filtered.length} countries
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goTo(currentPage - 1)}
              disabled={currentPage === 1}
              className="h-7 w-7 p-0"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            {/* Page numbers */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => Math.abs(p - currentPage) <= 1 || p === 1 || p === totalPages)
              .map((p, idx, arr) => (
                <>
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span key={`ellipsis-${p}`} className="px-1 text-xs" style={{ color: "var(--muted-foreground)" }}>…</span>
                  )}
                  <Button
                    key={p}
                    variant={p === currentPage ? "default" : "outline"}
                    size="sm"
                    onClick={() => goTo(p)}
                    className="h-7 w-7 p-0 text-xs"
                  >
                    {p}
                  </Button>
                </>
              ))
            }
            <Button
              variant="outline"
              size="sm"
              onClick={() => goTo(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="h-7 w-7 p-0"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {totalPages <= 1 && filtered.length > 0 && (
        <div
          className="border-t px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Showing {filtered.length} {filtered.length === 1 ? "country" : "countries"}
          </p>
        </div>
      )}
    </div>
  )
}