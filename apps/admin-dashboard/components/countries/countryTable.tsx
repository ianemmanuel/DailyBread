
"use client"

import { useState } from "react"
import { Globe, ChevronLeft, ChevronRight } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import { Button } from "@repo/ui/components/button"

interface Country {
  id: string
  name: string
  code: string
  phoneCode: string
  cityCount: number
}

interface CountryTableProps {
  countries: Country[]
  itemsPerPage?: number
}

export function CountryTable({ countries, itemsPerPage = 5 }: CountryTableProps) {
  const [currentPage, setCurrentPage] = useState(1)
  
  const totalPages = Math.ceil(countries.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentCountries = countries.slice(startIndex, endIndex)

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  return (
    <div>
      <div
        className="overflow-hidden rounded-xl border"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: "var(--border)" }}>
                <TableHead>Country</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="text-right">Cities</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentCountries.map((country) => (
                <TableRow key={country.id} style={{ borderColor: "var(--border)" }}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5" style={{ color: "var(--muted-foreground)" }} />
                      <span className="font-medium" style={{ color: "var(--foreground)" }}>
                        {country.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs" style={{ color: "var(--foreground)" }}>
                      {country.code}
                    </span>
                    <span className="ml-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {country.phoneCode}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{
                        backgroundColor: "color-mix(in oklch, var(--primary) 10%, transparent)",
                        color: "var(--primary)",
                      }}
                    >
                      {country.cityCount}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            {startIndex + 1}–{Math.min(endIndex, countries.length)} of {countries.length}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="h-7 w-7 p-0"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="h-7 w-7 p-0"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}