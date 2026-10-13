import Link from "next/link"
import { Button } from "@/components/ui/button"

interface Props {
  total: number
  page: string | number
  totalPages: number
  /** Path the Prev/Next links point at, e.g. "/cities" */
  basePath: string
  /** Query params to preserve alongside the new page number (search, status, sort, dir, …) */
  params?: Record<string, string>
  /** Plural noun shown next to the total, e.g. "applications", "cities" */
  itemLabel: string
}

function buildHref(basePath: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString()
  return qs ? `${basePath}?${qs}` : basePath
}

/**
 * Canonical Prev/Next pagination footer — every server-paginated table
 * should render this instead of hand-rolling another copy. Always
 * URL-encodes via URLSearchParams (unlike the old AdminUsersTable footer,
 * which built unencoded template-literal links).
 */
export function TablePagination({ total, page, totalPages, basePath, params = {}, itemLabel }: Props) {
  const pageNum = typeof page === "string" ? parseInt(page, 10) : page

  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium tabular-nums text-foreground">{total}</span> {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        {pageNum > 1 && (
          <Button asChild variant="ghost" size="sm" className="rounded-full transition-transform hover:-translate-y-px">
            <Link href={buildHref(basePath, { ...params, page: String(pageNum - 1) })}>Previous</Link>
          </Button>
        )}
        <span className="text-xs tabular-nums text-muted-foreground">Page {pageNum} of {totalPages}</span>
        {pageNum < totalPages && (
          <Button asChild variant="ghost" size="sm" className="rounded-full transition-transform hover:-translate-y-px">
            <Link href={buildHref(basePath, { ...params, page: String(pageNum + 1) })}>Next</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
