import type { Metadata } from "next"
import Link from "next/link"
import { Plus } from "lucide-react"
import { HERO_PRIORITY_TIERS } from "@repo/types/admin-app"
import type { HeroPromotionList } from "@repo/types/admin-app"

import { HeroPromotionsTable } from "@/components/marketing/HeroPromotionsTable"
import { StorefrontStatus } from "@/components/marketing/StorefrontStatus"
import { TableFilterBar } from "@/components/shared/TableFilterBar"
import { TablePagination } from "@/components/shared/TablePagination"
import { Button } from "@/components/ui/button"
import { adminFetch } from "@/lib/api"
import { loadScopedCountries } from "./places"

export const metadata: Metadata = { title: "Hero promotions" }

const PAGE_SIZE = 20

/*
 * A Server Component. Every admin with :read sees every promotion at every
 * reach — the filters below are a choice of view, not a permission, and the
 * backend decides per row whether this admin may write it.
 *
 * The three outcomes are distinguished deliberately: a failed request must
 * never look like an empty list (recurring bug class #4).
 */
interface PageProps {
  searchParams: Promise<{
    status?: string
    scope?: string
    priorityTier?: string
    country?: string
    page?: string
  }>
}

const TIER_LABELS: Record<string, string> = {
  STANDARD: "Standard",
  FEATURED: "Featured campaign",
  TAKEOVER: "Platform takeover",
}

export default async function MarketingPage({ searchParams }: PageProps) {
  const {
    status = "",
    scope = "",
    priorityTier = "",
    country = "",
    page = "1",
  } = await searchParams

  const currentPage = Math.max(1, Number(page) || 1)

  /* Every filter is forwarded explicitly. An absent value means "all", and the
   * filter bar emits an empty string for it rather than dropping the key —
   * otherwise "All" is unreachable once a filter has been used (bug class #3). */
  const query = new URLSearchParams({
    page: String(currentPage),
    pageSize: String(PAGE_SIZE),
  })
  if (status) query.set("status", status)
  if (scope) query.set("scope", scope)
  if (priorityTier) query.set("priorityTier", priorityTier)
  if (country) query.set("countryRef", country)

  let data: HeroPromotionList | null = null
  let error: string | null = null

  try {
    data = await adminFetch<HeroPromotionList>(
      `/admin/v1/marketing/hero-promotions?${query.toString()}`,
      { cache: "no-store" },
    )
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load promotions"
  }

  const countries = await loadScopedCountries()

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Hero promotions</h1>
          <p className="text-sm text-muted-foreground">
            The hero card at the top of the storefront. A visitor sees the
            highest-ranked promotion that applies to them — their city, then
            their country, then the global default.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/marketing/new">
            <Plus className="size-4" />
            New promotion
          </Link>
        </Button>
      </div>

      {/* Answers two questions the list itself cannot: what is live for a
          visitor right now, and is anything sitting unpublished. */}
      {data && (
        <StorefrontStatus
          statusCounts={data.statusCounts}
          globalFallback={data.globalFallback}
          activeStatus={status}
        />
      )}

      <TableFilterBar
        statusLabel="Status"
        statusOptions={[
          { value: "DRAFT", label: "Draft", dot: "bg-muted-foreground" },
          { value: "PUBLISHED", label: "Published", dot: "bg-success" },
          { value: "ARCHIVED", label: "Archived", dot: "bg-warning" },
        ]}
        defaultStatus={status}
        countryOptions={countries.map((c) => ({ value: c.slug, label: c.name }))}
        defaultCountry={country}
        extraFilters={[
          {
            name: "scope",
            label: "Reach",
            icon: "place",
            options: [
              { value: "GLOBAL", label: "Global" },
              { value: "COUNTRY", label: "Country" },
              { value: "CITY", label: "City" },
            ],
            defaultValue: scope,
          },
          {
            name: "priorityTier",
            label: "Ranking",
            icon: "filter",
            options: HERO_PRIORITY_TIERS.map((t) => ({
              value: t,
              label: TIER_LABELS[t] ?? t,
            })),
            defaultValue: priorityTier,
          },
        ]}
      />

      {error ? (
        <div className="admin-card py-10 text-center">
          <p className="text-sm font-medium">Could not load promotions</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      ) : (
        <>
          <HeroPromotionsTable
            promotions={data?.items ?? []}
            filtered={Boolean(status || scope || priorityTier || country)}
          />
          {data && (
            <TablePagination
              total={data.total}
              page={currentPage}
              totalPages={Math.ceil(data.total / data.pageSize)}
              basePath="/marketing"
              /* The WHOLE query string is rebuilt — a bare ?page=2 would drop
               * every active filter. */
              params={{
                ...(status ? { status } : {}),
                ...(scope ? { scope } : {}),
                ...(priorityTier ? { priorityTier } : {}),
                ...(country ? { country } : {}),
              }}
              itemLabel="promotions"
            />
          )}
        </>
      )}
    </div>
  )
}
