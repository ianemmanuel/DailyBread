import { redirect } from "next/navigation"

/* Moved to /meals/listings (Phase 2.1); query string preserved. */
export default async function LegacyListingsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value)
  }
  redirect(qs.toString() ? `/meals/listings?${qs}` : "/meals/listings")
}
