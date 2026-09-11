"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import type { AdminPayoutAccountAuditEntry } from "@repo/types/admin-app"

/*
 * An account's audit trail, a page at a time.
 *
 * The trail grows for the life of the account — claim, release, escalate,
 * reassign, verify, deactivate, flag — so rendering all of it made the page
 * heavier the longer an account had been managed, which is exactly backwards.
 * The server sends the first page with the detail response; later pages are
 * fetched on demand, so the common case (nobody scrolls the history) costs one
 * query and nothing more.
 */

interface Props {
  accountId  : string
  initial    : AdminPayoutAccountAuditEntry[]
  total      : number
  pageSize   : number
}

export function PayoutAuditHistory({ accountId, initial, total, pageSize }: Props) {
  const [entries, setEntries] = useState(initial)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  async function go(next: number) {
    if (next < 1 || next > totalPages || next === page || loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/finance/payout-accounts/${accountId}/audit?page=${next}`)
      const body = await res.json()
      if (!res.ok) return
      setEntries(body.data?.entries ?? [])
      setPage(next)
    } catch {
      // Leave the current page on screen — a failed page turn should not blank
      // the history the admin was already reading.
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-card">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Review &amp; audit history</h2>
        {total > 0 && (
          <span className="text-xs text-muted-foreground">
            {total} {total === 1 ? "entry" : "entries"}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recorded actions yet.</p>
      ) : (
        <ul className={`space-y-2.5 ${loading ? "opacity-50" : ""}`}>
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex flex-col gap-0.5 border-b border-border/50 pb-2.5 last:border-0 sm:flex-row sm:items-baseline sm:justify-between"
            >
              <span className="text-sm text-foreground">
                <span className="font-mono text-xs text-muted-foreground">{e.action}</span>
                {e.actor ? ` · ${e.actor}` : ""}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(e.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/50 pt-3">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            <Button
              type="button" variant="outline" size="sm" className="h-8 gap-1 rounded-full px-2.5"
              disabled={page === 1 || loading} onClick={() => go(page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />Newer
            </Button>
            <Button
              type="button" variant="outline" size="sm" className="h-8 gap-1 rounded-full px-2.5"
              disabled={page === totalPages || loading} onClick={() => go(page + 1)}
            >
              Older<ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
