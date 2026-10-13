"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Props {
  options: Array<{ slug: string; name: string }>
  selected: string
}

/** Drives the ?type=<slug> query param that selects which category the revenue page's chart/table show. */
export function VendorCategorySelect({ options, selected }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function onChange(slug: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("type", slug)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <Select value={selected} onValueChange={onChange}>
      <SelectTrigger className="w-56 rounded-full" style={{ backgroundColor: "var(--input)", color: "var(--foreground)" }}>
        <SelectValue placeholder="Select a category…" />
      </SelectTrigger>
      <SelectContent className="rounded-xl" style={{ backgroundColor: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)" }}>
        {options.map((o) => (
          <SelectItem key={o.slug} value={o.slug} className="rounded-lg">{o.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
