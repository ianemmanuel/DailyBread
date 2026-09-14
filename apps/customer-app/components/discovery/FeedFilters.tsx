"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Search, SlidersHorizontal, X, Loader2 } from "lucide-react"
import { Input } from "@repo/ui/components/input"
import type { DiscoveryResult, DiscoverySort } from "@repo/types/customer-app"

/*
 * Search, sort and the filter chips.
 *
 * The ONLY client component on the feed. It writes the query string; the server
 * does all the filtering and re-renders the page. That keeps the result
 * shareable and back-button-correct, and means no filtering logic exists twice.
 *
 * useTransition drives the loading state: React tells us the server render is
 * in flight, so the UI can dim rather than either freezing or flashing a
 * skeleton over results that are about to barely change.
 */

const SORTS: Array<{ value: DiscoverySort; label: string }> = [
  { value: "RELEVANCE",     label: "Best match" },
  { value: "DELIVERY_TIME", label: "Fastest" },
  { value: "RATING",        label: "Top rated" },
  { value: "DISTANCE",      label: "Nearest" },
]

const TOGGLES: Array<{ param: string; label: string }> = [
  { param: "openNow",      label: "Open now" },
  { param: "hasOffer",     label: "Offers" },
  { param: "freeDelivery", label: "Free delivery" },
]

export function FeedFilters({ cuisines }: { cuisines: DiscoveryResult["availableCuisines"] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = React.useTransition()

  const [search, setSearch] = React.useState(params.get("search") ?? "")

  /** One writer for the query string, so every control behaves identically —
   *  and every change resets to page one, since page 3 of the old filter is
   *  meaningless under the new one. */
  const apply = React.useCallback((mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString())
    mutate(next)
    next.delete("page")
    startTransition(() => {
      router.replace(next.size > 0 ? `${pathname}?${next}` : pathname, { scroll: false })
    })
  }, [params, pathname, router])

  /*
   * Debounced, because every keystroke would otherwise be a server render. 350 ms
   * is long enough to finish a word and short enough not to feel laggy. The
   * effect skips when the input already matches the URL — which is what stops
   * it firing again on the render caused by its own navigation.
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
    !!activeCuisine || TOGGLES.some((t) => params.get(t.param) === "1") ||
    activeSort !== "RELEVANCE" || !!params.get("search")

  return (
    <div className={`space-y-3 transition-opacity duration-200 ${pending ? "opacity-60" : ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search restaurants or dishes"
            aria-label="Search restaurants or dishes"
            className="h-11 rounded-full pl-9 pr-9"
          />
          {pending
            ? <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-[var(--muted-foreground)]" />
            : search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                >
                  <X className="size-4" />
                </button>
              )}
        </div>

        {/* A native select rather than a styled dropdown: it is four fixed
            options, and the OS picker is faster and more accessible on a phone
            than anything rebuilt in a popover. */}
        <label className="relative shrink-0">
          <span className="sr-only">Sort restaurants</span>
          <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <select
            value={activeSort}
            onChange={(event) => apply((next) =>
              event.target.value === "RELEVANCE" ? next.delete("sort") : next.set("sort", event.target.value))}
            className="h-11 w-full cursor-pointer appearance-none rounded-full border border-[var(--border)] bg-[var(--card)] pl-9 pr-9 text-sm font-medium text-[var(--foreground)] sm:w-auto"
          >
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>{sort.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="rail">
        {TOGGLES.map((toggle) => {
          const on = params.get(toggle.param) === "1"
          return (
            <button
              key={toggle.param}
              type="button"
              aria-pressed={on}
              onClick={() => apply((next) => (on ? next.delete(toggle.param) : next.set(toggle.param, "1")))}
              className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]"
              }`}
            >
              {toggle.label}
            </button>
          )
        })}

        {/* Only cuisines actually present in this result set — a filter that
            could only ever return nothing is worse than no filter. */}
        {cuisines.map((cuisine) => {
          const on = activeCuisine === cuisine.id
          return (
            <button
              key={cuisine.id}
              type="button"
              aria-pressed={on}
              onClick={() => apply((next) => (on ? next.delete("cuisine") : next.set("cuisine", cuisine.id)))}
              className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]"
              }`}
            >
              {cuisine.name}
              <span className={`ml-1.5 text-xs ${on ? "text-white/70" : "text-[var(--muted-foreground)]"}`}>
                {cuisine.count}
              </span>
            </button>
          )
        })}

        {hasFilters && (
          <button
            type="button"
            onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}
            className="shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium text-[var(--muted-foreground)] underline-offset-4 transition-colors hover:text-[var(--foreground)] hover:underline"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  )
}
