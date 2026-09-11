"use client"

import { useTransition } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Globe2 } from "lucide-react"
import { SearchableSelect } from "@/components/shared/SearchableSelect"

interface Props {
  options : Array<{ slug: string; name: string }>
  selected: string
  /** searchParam key to write — defaults to "country" */
  paramKey?: string
}

/**
 * Global-scope-only country narrowing for single-focus analytics pages
 * (Adoption, Revenue) — the top-right counterpart to the country column in
 * TableFilterBar used on list pages. Country-scoped admins never see this
 * (their page is already locked to their own country server-side); this
 * only renders when the caller has more than one option to offer.
 */
export function VendorCategoryCountrySelect({ options, selected, paramKey = "country" }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "all") params.delete(paramKey)
    else params.set(paramKey, value)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  return (
    <SearchableSelect
      options={options.map((o) => ({ value: o.slug, label: o.name }))}
      value={selected}
      onChange={onChange}
      allOption={{ value: "all", label: "All countries" }}
      icon={Globe2}
      loading={isPending}
      searchPlaceholder="Search countries…"
      emptyLabel="No country found."
      className="sm:w-52"
      align="end"
      aria-label="Country"
    />
  )
}
