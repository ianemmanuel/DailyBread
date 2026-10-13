import { redirect } from "next/navigation"

interface PageProps {
  searchParams: Promise<{ country?: string }>
}

/*
 * Moved into the Finance domain (CLAUDE.md) — /vendors/revenue's content
 * now lives at /finance/vendors (with the cross-country ranking bug
 * fixed there). Kept as a redirect, not deleted, so any existing
 * bookmark/link doesn't 404.
 */
export default async function VendorRevenueRedirect({ searchParams }: PageProps) {
  const { country } = await searchParams
  redirect(country ? `/finance/vendors?country=${country}` : "/finance/vendors")
}
