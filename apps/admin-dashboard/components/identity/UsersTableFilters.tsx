"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useTransition }  from "react"
import { Search } from "lucide-react"
import { Input } from "@repo/ui/components/input"
import { Button } from "@repo/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select"

interface Props {
  defaultSearch: string
  defaultStatus: string
}

const triggerStyle = {
  backgroundColor: "var(--input)",
  color          : "var(--foreground)",
}

const contentStyle = {
  backgroundColor: "var(--popover)",
  color          : "var(--popover-foreground)",
  border         : "1px solid var(--border)",
}

export function UsersTableFilters({ defaultSearch, defaultStatus }: Props) {
  const router                       = useRouter()
  const pathname                     = usePathname()
  const searchParams                 = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function applyFilters(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data   = new FormData(e.currentTarget)
    const search = (data.get("search") as string).trim()
    const status = (data.get("status") as string).trim()

    const params = new URLSearchParams(searchParams.toString())
    params.set("page", "1")
    search                            ? params.set("search", search) : params.delete("search")
    status && status !== "all"        ? params.set("status", status) : params.delete("status")

    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  function clearFilters() {
    startTransition(() => router.push(pathname))
  }

  const hasFilters = defaultSearch || (defaultStatus && defaultStatus !== "all")

  return (
    <form onSubmit={applyFilters} className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          defaultValue={defaultSearch}
          placeholder="Search by name, email, or employee ID…"
          className="pl-9"
        />
      </div>

      <Select name="status" defaultValue={defaultStatus || "all"}>
        <SelectTrigger className="w-full sm:w-44" style={triggerStyle}>
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent style={contentStyle}>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="pending">Pending invitation</SelectItem>
          <SelectItem value="invited">Invited — awaiting</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="suspended">Suspended</SelectItem>
          <SelectItem value="deactivated">Deactivated</SelectItem>
        </SelectContent>
      </Select>

      <Button type="submit" variant="secondary" size="sm" disabled={isPending}>Filter</Button>
      {hasFilters && (
        <Button type="button" variant="ghost" size="sm" onClick={clearFilters} disabled={isPending}>
          Clear
        </Button>
      )}
    </form>
  )
}