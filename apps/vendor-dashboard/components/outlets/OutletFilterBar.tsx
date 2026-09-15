"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

/*
 * Search / status / city filters for the outlets list.
 *
 * Client-side only because it writes the query string; the filtering itself is
 * entirely server-side — the page re-renders from the backend with the new
 * params. Changing any filter resets to page 1, otherwise a narrowed result
 * set would land the vendor on an empty page 3.
 */

const STATUSES = [
  { value: "ACTIVE",               label: "Active" },
  { value: "SUSPENDED",            label: "Suspended" },
  { value: "SUSPENDED_COMPLIANCE", label: "Suspended (documents)" },
  { value: "BANNED",               label: "Banned" },
]

const ALL = "__all__"

interface Props {
  cities: { id: string; name: string }[]
}

export function OutletFilterBar({ cities }: Props) {
  const router = useRouter()
  const params = useSearchParams()

  const [search, setSearch] = React.useState(params.get("search") ?? "")
  const status = params.get("status") ?? ALL
  const cityId = params.get("cityId") ?? ALL

  function apply(next: Record<string, string | null>) {
    const qs = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(next)) {
      if (!value || value === ALL) qs.delete(key)
      else qs.set(key, value)
    }
    qs.delete("page")
    router.push(qs.size ? `/outlets?${qs}` : "/outlets")
  }

  const hasFilters = Boolean(params.get("search") || params.get("status") || params.get("cityId"))

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <form
        className="relative w-full sm:w-64"
        onSubmit={(e) => { e.preventDefault(); apply({ search }) }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or address"
          className="rounded-xl pl-9"
        />
      </form>

      <Select value={status} onValueChange={(v) => apply({ status: v })}>
        <SelectTrigger className="w-full rounded-xl sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>

      {/* Only worth a picker once the vendor actually operates in more than
          one city — otherwise it could only ever filter to everything. */}
      {cities.length > 1 && (
        <Select value={cityId} onValueChange={(v) => apply({ cityId: v })}>
          <SelectTrigger className="w-full rounded-xl sm:w-44"><SelectValue placeholder="City" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All cities</SelectItem>
            {cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {hasFilters && (
        <button
          type="button"
          onClick={() => { setSearch(""); router.push("/outlets") }}
          className="inline-flex cursor-pointer items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <X className="size-3.5" />Clear
        </button>
      )}
    </div>
  )
}
