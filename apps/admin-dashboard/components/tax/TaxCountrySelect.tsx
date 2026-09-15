"use client"

import { useTransition } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Globe2 } from "lucide-react"
import { Label } from "@/components/ui/label"
import { SearchableSelect } from "@/components/shared/SearchableSelect"

/**
 * Which market's tax to look at. Pushes `?country=<slug>`.
 *
 * Deliberately has NO "all countries" row, unlike the revenue selectors: there
 * is no aggregate tax position to show. Two markets quote prices differently,
 * name the tax differently and charge different rates, so a combined view
 * would be a number that means nothing. This control only renders for a global
 * admin anyway — a country-scoped one has their market resolved server-side.
 */
export function TaxCountrySelect({
  countries,
  selected,
}: {
  countries: { value: string; label: string }[]
  selected : string | undefined
}) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("country", value)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  return (
    <div className="w-full space-y-1.5 sm:w-64">
      <Label className="text-xs font-medium text-muted-foreground">Market</Label>
      <SearchableSelect
        options={countries}
        value={selected ?? ""}
        onChange={onChange}
        icon={Globe2}
        loading={isPending}
        placeholder="Choose a country…"
        searchPlaceholder="Search countries…"
        emptyLabel="No country found."
        aria-label="Country"
      />
    </div>
  )
}
