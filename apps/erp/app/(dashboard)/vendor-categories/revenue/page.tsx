import { redirect } from "next/navigation"

interface PageProps {
  searchParams: Promise<{ type?: string; country?: string }>
}

/*
 * Moved into the Finance domain (CLAUDE.md, 2026-08-27) — content now
 * lives at /finance/vendor-categories. Kept as a redirect, not deleted,
 * so any existing bookmark/link doesn't 404.
 */
export default async function VendorCategoriesRevenueRedirect({ searchParams }: PageProps) {
  const { type, country } = await searchParams
  const qp = new URLSearchParams()
  if (type) qp.set("type", type)
  if (country) qp.set("country", country)
  redirect(qp.toString() ? `/finance/vendor-categories?${qp}` : "/finance/vendor-categories")
}
