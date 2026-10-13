import { redirect } from "next/navigation"

interface PageProps {
  searchParams: Promise<{ country?: string }>
}

/*
 * Moved into the Finance domain (CLAUDE.md) — /countries/revenue's content
 * now lives at /finance. Kept as a redirect, not deleted, so any existing
 * bookmark/link doesn't 404.
 */
export default async function CountryRevenueRedirect({ searchParams }: PageProps) {
  const { country } = await searchParams
  redirect(country ? `/finance?country=${country}` : "/finance")
}
