
"use client"

import { useState } from "react"
import { Building2, ChevronLeft, ChevronRight } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import { Badge } from "@repo/ui/components/badge"
import { Button } from "@repo/ui/components/button"

interface City {
  id: string
  name: string
  code: string | null
  timezone: string
  status: string
  country: {
    id: string
    name: string
    code: string
    phoneCode: string
  }
}

interface CityTableProps {
  cities: City[]
  itemsPerPage?: number
}

export function CityTable({ cities, itemsPerPage = 10 }: CityTableProps) {
  const [currentPage, setCurrentPage] = useState(1)
  
  const totalPages = Math.ceil(cities.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentCities = cities.slice(startIndex, endIndex)

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  if (cities.length === 0) {
    return (
      <div
        className="flex h-64 flex-col items-center justify-center rounded-xl border"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <Building2 className="mb-2 h-8 w-8" style={{ color: "var(--muted-foreground)" }} />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          No cities found
        </p>
      </div>
    )
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
                <TableHead className="w-[80px]">Code</TableHead>
                <TableHead>City Name</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentCities.map((city) => (
                <TableRow key={city.id} style={{ borderColor: "var(--border)" }}>
                  <TableCell className="font-mono text-xs">
                    {city.code || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5" style={{ color: "var(--muted-foreground)" }} />
                      <span className="font-medium" style={{ color: "var(--foreground)" }}>
                        {city.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm" style={{ color: "var(--foreground)" }}>
                        {city.country.name}
                      </span>
                      <span className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
                        {city.country.code}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs" style={{ color: "var(--foreground)" }}>
                      {city.timezone}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: "color-mix(in oklch, var(--success) 10%, transparent)",
                        color: "var(--success)",
                        borderColor: "color-mix(in oklch, var(--success) 20%, transparent)",
                      }}
                    >
                      {city.status.toLowerCase()}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Showing {startIndex + 1}–{Math.min(endIndex, cities.length)} of {cities.length} cities
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => goToPage(pageNum)}
                    className="h-8 w-8 p-0"
                    style={currentPage === pageNum ? {} : { borderColor: "var(--border)" }}
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}