import { redirect } from "next/navigation"

/*
 * Meals became its own ERP domain (/meals, Phase 2.1): the dish list is now
 * /meals/dishes. Kept as a thin redirect, query string preserved, so existing
 * links and bookmarks don't 404 — same convention as /vendors/outlets.
 */
export default async function LegacyMealsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value)
  }
  redirect(qs.toString() ? `/meals/dishes?${qs}` : "/meals/dishes")
}
