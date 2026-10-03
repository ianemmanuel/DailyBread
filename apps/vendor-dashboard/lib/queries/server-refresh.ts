"use client"

import { useRouter } from "next/navigation"

/*
 * Re-render the server components on screen after a write that changes what
 * they show — specifically go-live READINESS.
 *
 * The "your store isn't live yet" banner and the sidebar's selling-ready split
 * are rendered by the (dashboard) LAYOUT from getVendorSession (no-store). The
 * App Router keeps a shared layout across client navigations and never
 * re-renders it on its own, and React Query invalidation only reaches client
 * caches — so after publishing, or fixing the profile, the banner went on
 * naming a blocker the vendor had just cleared until a full reload.
 *
 * `router.refresh()` is one request that re-renders the current route,
 * layout included, in place: no reload, no polling, client state kept. It is
 * called only after a write SUCCEEDS. Changes made elsewhere (an admin
 * verifying a payout account) still show on the next full load, which is the
 * bound for anything no event in this tab can announce.
 */
export function useRefreshServerState(): () => void {
  const router = useRouter()
  return () => router.refresh()
}
