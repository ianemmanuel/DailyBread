"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { Search }        from "lucide-react"
import { Input }         from "@repo/ui/components/input"
import { Button }        from "@repo/ui/components/button"
import { Label }         from "@repo/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select"

interface Props {
  defaultSearch : string
  defaultStatus : string
  defaultSort   : string
  defaultDir    : string
}

const selectStyle = {
  backgroundColor: "var(--input)",
  color          : "var(--foreground)",
}

const contentStyle = {
  backgroundColor: "var(--popover)",
  color          : "var(--popover-foreground)",
  border         : "1px solid var(--border)",
}

export function VendorApplicationFilters({
  defaultSearch, defaultStatus, defaultSort, defaultDir,
}: Props) {
  const router                       = useRouter()
  const pathname                     = usePathname()
  const searchParams                 = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function applyFilters(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data    = new FormData(e.currentTarget)
    const search  = (data.get("search")  as string) ?? ""
    const status  = (data.get("status")  as string) ?? ""
    const sort    = (data.get("sort")    as string) || "submittedAt"
    const dir     = (data.get("dir")     as string) || "desc"

    const params  = new URLSearchParams(searchParams.toString())
    params.set("page", "1")
    search && status !== "all" ? params.set("search", search) : params.delete("search")
    status && status !== "all" ? params.set("status", status) : params.delete("status")
    params.set("sort", sort)
    params.set("dir",  dir)

    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  function clearFilters() {
    startTransition(() => router.push(pathname))
  }

  const hasFilters = defaultSearch || defaultStatus

  return (
    <form onSubmit={applyFilters} className="flex flex-col gap-3 lg:flex-row lg:items-end">

      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="search" defaultValue={defaultSearch} placeholder="Search business or email…" className="pl-9" />
      </div>

      {/* Status */}
      <div className="space-y-1">
        <Label className="text-xs">Status</Label>
        <Select name="status" defaultValue={defaultStatus || "all"}>
          <SelectTrigger className="w-44" style={selectStyle}>
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent style={contentStyle}>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="SUBMITTED">Submitted</SelectItem>
            <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sort by */}
      <div className="space-y-1">
        <Label className="text-xs">Sort by</Label>
        <Select name="sort" defaultValue={defaultSort || "submittedAt"}>
          <SelectTrigger className="w-44" style={selectStyle}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={contentStyle}>
            <SelectItem value="submittedAt">Date submitted</SelectItem>
            <SelectItem value="createdAt">Date created</SelectItem>
            <SelectItem value="legalBusinessName">Business name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Direction */}
      <div className="space-y-1">
        <Label className="text-xs">Order</Label>
        <Select name="dir" defaultValue={defaultDir || "desc"}>
          <SelectTrigger className="w-32" style={selectStyle}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={contentStyle}>
            <SelectItem value="desc">Newest first</SelectItem>
            <SelectItem value="asc">Oldest first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-end gap-2">
        <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
          Filter
        </Button>
        {hasFilters && (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters} disabled={isPending}>
            Clear
          </Button>
        )}
      </div>
    </form>
  )
}