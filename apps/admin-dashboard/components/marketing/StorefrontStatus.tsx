import Link from "next/link"
import { AlertTriangle, CheckCircle2, FileEdit, ImageOff } from "lucide-react"

import type { HeroPromotionList } from "@repo/types/admin-app"

/*
 * What the storefront is ACTUALLY showing, and what is waiting on somebody.
 *
 * A Server Component with no state — it renders two facts the list of rows
 * cannot express on its own:
 *
 *   1. THE LIVE GLOBAL FALLBACK. Resolved server-side through the very
 *      function the storefront calls, so this is what a visitor who has not
 *      shared their location sees right now, not an inference from statuses
 *      and dates. When it is null, nothing is scheduled globally and the
 *      storefront has quietly dropped to its own built-in hero — the thing
 *      that used to be invisible from here.
 *
 *   2. DRAFTS. Counted across EVERY promotion, ignoring the current filters,
 *      because the failure this exists to catch is an admin creating a
 *      promotion, navigating away, and never learning it was never published.
 *      A count that respected the filters would hide exactly the row you
 *      forgot about.
 *
 * The draft count links into the filtered view rather than explaining where to
 * find them.
 */
export function StorefrontStatus({
  statusCounts,
  globalFallback,
  activeStatus,
}: {
  statusCounts: HeroPromotionList["statusCounts"]
  globalFallback: HeroPromotionList["globalFallback"]
  /** Lets the Drafts pill show it is already the active view. */
  activeStatus: string
}) {
  const draftsActive = activeStatus === "DRAFT"

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* ── What a visitor sees with no location ─────────────────────────── */}
      <div className="admin-card flex items-start gap-3 py-4">
        {globalFallback ? (
          globalFallback.hasImage ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <ImageOff className="mt-0.5 size-4 shrink-0 text-warning" />
          )
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        )}

        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            Live now for a visitor with no location
          </p>
          {globalFallback ? (
            <>
              <p className="truncate text-sm font-semibold">{globalFallback.headline}</p>
              {!globalFallback.hasImage && (
                <p className="mt-0.5 text-xs text-warning">
                  It has no usable image, so the storefront is showing its
                  built-in photograph instead.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">The built-in hero</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                No global promotion is published and inside its run window, so
                the storefront is using its own fallback copy. Publish a global
                promotion with no end date to own this permanently.
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── What is waiting on somebody ──────────────────────────────────── */}
      <div className="admin-card flex items-start gap-3 py-4">
        <FileEdit className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Not yet live</p>
          {statusCounts.DRAFT > 0 ? (
            <p className="text-sm">
              <Link
                href="/marketing?status=DRAFT"
                className="font-semibold underline underline-offset-4"
                aria-current={draftsActive ? "page" : undefined}
              >
                {statusCounts.DRAFT} draft{statusCounts.DRAFT === 1 ? "" : "s"}
              </Link>{" "}
              <span className="text-muted-foreground">
                created but never published.
              </span>
            </p>
          ) : (
            <p className="text-sm font-semibold">Nothing unpublished</p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {statusCounts.PUBLISHED} published · {statusCounts.ARCHIVED} archived
          </p>
        </div>
      </div>
    </div>
  )
}
