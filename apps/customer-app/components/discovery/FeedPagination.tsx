import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

/*
 * Feed paging.
 *
 * Link-based, not a client component — the feed is a server-rendered page that
 * reads searchParams, so changing page needs no JavaScript at all. It also
 * means each page is a real URL: shareable, back-button-correct and crawlable.
 * Same reasoning as the vendor dashboard's ListPagination.
 *
 * The CURRENT params are passed in and rebuilt into each href. A bare
 * `?page=2` href would replace the whole query string and silently drop every
 * active filter, which is the sort of thing that only shows up when someone
 * filters, pages, and wonders why the list changed.
 *
 * Rendered only when there is more than one page — a control that can do
 * nothing is noise.
 */
export function FeedPagination({
  page, pageSize, total, params,
}: {
  page    : number
  pageSize: number
  total   : number
  /** The feed's current searchParams, so paging preserves the filters. */
  params  : Record<string, string | undefined>
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

  const first = (page - 1) * pageSize + 1
  const last  = Math.min(page * pageSize, total)

  function hrefFor(target: number): string {
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (key !== "page" && value) next.set(key, value)
    }
    if (target > 1) next.set("page", String(target))
    return next.size > 0 ? `/?${next}` : "/"
  }

  return (
    <nav
      aria-label="Restaurant pages"
      className="flex flex-col items-center justify-between gap-3 pt-2 sm:flex-row"
    >
      <p className="text-sm text-[var(--muted-foreground)]">
        Showing{" "}
        <span className="font-medium text-[var(--foreground)]">
          {first}&ndash;{last}
        </span>{" "}
        of {total}
      </p>

      <div className="flex items-center gap-2">
        <PageLink href={hrefFor(page - 1)} disabled={page <= 1} label="Previous page">
          <ChevronLeft className="size-4" />
          Previous
        </PageLink>

        <span className="px-1 text-sm text-[var(--muted-foreground)]">
          {page} of {totalPages}
        </span>

        <PageLink href={hrefFor(page + 1)} disabled={page >= totalPages} label="Next page">
          Next
          <ChevronRight className="size-4" />
        </PageLink>
      </div>
    </nav>
  )
}

/** A disabled control is a <span>, never a link to nowhere. */
function PageLink({
  href, disabled, label, children,
}: {
  href    : string
  disabled: boolean
  label   : string
  children: React.ReactNode
}) {
  const className =
    "inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3.5 py-2 text-sm font-medium transition-colors"

  if (disabled) {
    return (
      <span aria-disabled className={`${className} cursor-not-allowed text-[var(--muted-foreground)] opacity-50`}>
        {children}
      </span>
    )
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={`${className} cursor-pointer bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]`}
    >
      {children}
    </Link>
  )
}
