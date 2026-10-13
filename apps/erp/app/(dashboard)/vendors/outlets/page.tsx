import { redirect } from "next/navigation"

/*
 * Outlets moved to their own top-level section (2026-09-10). Kept as a thin
 * redirect rather than deleted, same convention as /vendors/revenue ->
 * /finance/vendors, so existing links and bookmarks don't 404. The query string
 * is preserved because the vendor-account page links here with ?vendor=.
 */
export default async function LegacyOutletsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value)
  }
  redirect(qs.toString() ? `/outlets?${qs}` : "/outlets")
}
