"use client"

import { useTransition } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Globe2 } from "lucide-react"
import { Label } from "@repo/ui/components/label"
import { SearchableSelect } from "@/components/shared/SearchableSelect"

export interface RevenueCountryOption {
  slug: string
  name: string
}

interface Props {
  options : RevenueCountryOption[]
  /** Currently selected slug, or "all" for the aggregate view. */
  selected: string
  /** COUNTRY-tier admins — single option, nothing to actually switch. Keeps the
   *  control surface visually consistent across tiers. */
  locked? : boolean
}

/**
 * Scope selector for /countries/revenue, /finance/vendor-categories and
 * /finance/vendors — the shared searchable select, plus an "All countries
 * (aggregate)" row since revenue can be viewed platform-wide as well as
 * per-country. Pushes `?country=<slug>` (or clears it) through the URL.
 */
export function RevenueCountrySelect({ options, selected, locked = false }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "all") params.delete("country")
    else params.set("country", value)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  return (
    <div className="w-full space-y-1.5 sm:w-64">
      <Label className="text-xs font-medium text-muted-foreground">Scope</Label>
      <SearchableSelect
        options={options.map((o) => ({ value: o.slug, label: o.name }))}
        value={selected}
        onChange={onChange}
        allOption={{ value: "all", label: "All countries (aggregate)" }}
        icon={Globe2}
        loading={isPending}
        disabled={locked}
        searchPlaceholder="Search countries…"
        emptyLabel="No country found."
        aria-label="Country scope"
      />
    </div>
  )
}
