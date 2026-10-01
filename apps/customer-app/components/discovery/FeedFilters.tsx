"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Loader2, Search, SlidersHorizontal, X } from "lucide-react"
import type { DiscoveryResult, DiscoverySort } from "@repo/types/customer-app"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/*
 * Search, sort and the filter chips.
 *
 * The ONLY client component on the feed. It writes the query string; the
 * SERVER does all the filtering and re-renders the page. That keeps a result
 * shareable and back-button-correct, and means no filtering logic exists twice
 * (principle 1).
 *
 * useTransition drives the loading state: React says when the server render is
 * in flight, so the UI dims rather than freezing or flashing a skeleton over
 * results that are about to barely change.
 */

const SORTS: Array<{ value: DiscoverySort; label: string }> = [
  { value: "RELEVANCE",     label: "Best match" },
  { value: "DELIVERY_TIME", label: "Fastest" },
  { value: "RATING",        label: "Top rated" },
  { value: "DISTANCE",      label: "Nearest" },
]

export type FeedToggle = "openNow" | "hasOffer" | "freeDelivery"

const TOGGLES: Array<{ param: FeedToggle; label: string }> = [
  { param: "openNow",      label: "Open now" },
  { param: "hasOffer",     label: "Offers" },
  { param: "freeDelivery", label: "Free delivery" },
]

const CHIP = "shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors"
const CHIP_ON = "border-transparent bg-primary text-primary-foreground"
const CHIP_OFF = "border-border bg-card text-foreground hover:bg-muted"

export function FeedFilters({
  cuisines,
  sortable = true,
  toggles,
}: {
  /* Places and meals facets share this shape. */
  cuisines: DiscoveryResult["availableCuisines"]
  /*
   * False while browsing a whole city. Every sort this app offers is
   * distance- or ETA-derived, and both need a delivery point — so the control
   * is ABSENT rather than present-and-ignored. A sort that quietly does
   * nothing is the same failure as a filter that never reaches its mapper.
   */
  sortable?: boolean
  /*
   * Which toggles this list's endpoint actually applies; all three when
   * omitted (places). The meals API reads `hasOffer` only, so the meals page
   * passes just that — same rule as `sortable`: absent, never ignored.
   */
  toggles?: FeedToggle[]
}) {
  const shownToggles = toggles ? TOGGLES.filter((t) => toggles.includes(t.param)) : TOGGLES
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = React.useTransition()

  const [search, setSearch] = React.useState(params.get("search") ?? "")

  /** One writer for the query string, so every control behaves identically —
   *  and every change resets to page one, since page 3 of the old filter means
   *  nothing under the new one. */
  const apply = React.useCallback((mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString())
    mutate(next)
    next.delete("page")
    startTransition(() => {
      router.replace(next.size > 0 ? `${pathname}?${next}` : pathname, { scroll: false })
    })
  }, [params, pathname, router])

  /*
   * Debounced: every keystroke would otherwise be a server render. 350 ms is
   * long enough to finish a word and short enough not to feel laggy. The effect
   * skips when the input already matches the URL, which stops it firing again
   * on the render its own navigation caused.
   */
  React.useEffect(() => {
    const current = params.get("search") ?? ""
    if (search === current) return

    const timer = setTimeout(() => {
      apply((next) => (search.trim() ? next.set("search", search.trim()) : next.delete("search")))
    }, 350)
    return () => clearTimeout(timer)
  }, [search, params, apply])

  const activeSort = (params.get("sort") ?? "RELEVANCE") as DiscoverySort
  const activeCuisine = params.get("cuisine")
  const hasFilters =
    !!activeCuisine || shownToggles.some((t) => params.get(t.param) === "1") ||
    (sortable && activeSort !== "RELEVANCE") || !!params.get("search")

  return (
    <div className={cn("space-y-3 transition-opacity duration-200", pending && "opacity-60")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search restaurants or dishes"
            aria-label="Search restaurants or dishes"
            /* text-base on phones stops iOS zooming into the field on focus. */
            className="h-11 rounded-full pr-9 pl-9 text-base sm:text-sm"
          />
          {pending
            ? <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            : search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
        </div>

        {/* A native select: four fixed options, and the OS picker is faster and
            more accessible on a phone than anything rebuilt in a popover. */}
        {sortable && (
        <label className="relative shrink-0">
          <span className="sr-only">Sort restaurants</span>
          <SlidersHorizontal className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={activeSort}
            onChange={(event) => apply((next) =>
              event.target.value === "RELEVANCE" ? next.delete("sort") : next.set("sort", event.target.value))}
            className="h-11 w-full cursor-pointer appearance-none rounded-full border border-border bg-card pr-9 pl-9 text-sm font-medium text-foreground sm:w-auto"
          >
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>{sort.label}</option>
            ))}
          </select>
        </label>
        )}
      </div>

      <div className="rail">
        {shownToggles.map((toggle) => {
          const on = params.get(toggle.param) === "1"
          return (
            <button
              key={toggle.param}
              type="button"
              aria-pressed={on}
              onClick={() => apply((next) => (on ? next.delete(toggle.param) : next.set(toggle.param, "1")))}
              className={cn(CHIP, on ? CHIP_ON : CHIP_OFF)}
            >
              {toggle.label}
            </button>
          )
        })}

        {/* Only cuisines actually present in THIS result set — a filter that
            could only ever return nothing is worse than no filter. This is the
            AVAILABLE state the catalogue endpoint deliberately does not answer. */}
        {cuisines.map((cuisine) => {
          const on = activeCuisine === cuisine.id
          return (
            <button
              key={cuisine.id}
              type="button"
              aria-pressed={on}
              onClick={() => apply((next) => (on ? next.delete("cuisine") : next.set("cuisine", cuisine.id)))}
              className={cn(CHIP, on ? CHIP_ON : CHIP_OFF)}
            >
              {cuisine.name}
              <span className={cn("ml-1.5 text-xs", on ? "opacity-70" : "text-muted-foreground")}>
                {cuisine.count}
              </span>
            </button>
          )
        })}

        {hasFilters && (
          <button
            type="button"
            onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}
            className="shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  )
}
