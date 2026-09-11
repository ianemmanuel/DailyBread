import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PieChart, Utensils, Leaf } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { getFilterableCountries } from "@/lib/countries/filterable-countries"
import { VendorCategoryCountrySelect } from "@/components/vendor-categories/VendorCategoryCountrySelect"
import { AdoptionDonutChart } from "@/components/vendor-categories/AdoptionDonutChart"
import { VendorCategoryAdoptionTable } from "@/components/vendor-categories/VendorCategoryAdoptionTable"
import { FoodTagAdoptionPanel } from "@/components/food-tags/FoodTagAdoptionPanel"
import type { VendorTypeAdoptionResult } from "@/types/vendor-type.types"
import type { FoodTagAdoptionResult } from "@/types/food-tag.types"

export const metadata: Metadata = { title: "Catalog — Adoption" }
export const revalidate = 60

interface PageProps {
  searchParams: Promise<{ country?: string }>
}

/** Top 5 + an "others" bucket, derived from an already-fetched full ranking — avoids a second network call just to feed the summary donut. */
function toTopFive(data: VendorTypeAdoptionResult): VendorTypeAdoptionResult {
  const top = data.items.slice(0, 5)
  const rest = data.items.slice(5)
  const restCount = rest.reduce((sum, i) => sum + i.count, 0) + (data.others?.count ?? 0)
  return {
    total: data.total,
    items: top,
    others: restCount > 0
      ? { count: restCount, percentage: data.total > 0 ? Math.round((restCount / data.total) * 1000) / 10 : 0 }
      : null,
  }
}

/**
 * Adoption across the whole Catalog section — vendor categories, cuisines and
 * dietary tags on one page, because they answer one question: of the vocabulary
 * we curate, what did vendors actually choose.
 *
 * Scope works both ways, which is the point. Global scope gets a country picker
 * that narrows every panel, defaulting to the platform-wide aggregate; a
 * country-scoped admin gets no picker and is resolved to their own country
 * server-side. Both readings are useful and neither is a special case: a global
 * ops admin curating the catalog needs the aggregate, and a country team needs
 * to know what their own market picked.
 *
 * Categories and food tags are gated separately — an admin holding only one of
 * the two READ permissions sees only that half rather than an error.
 */
export default async function CatalogAdoptionPage({ searchParams }: PageProps) {
  const session = await getAdminSession()

  const canReadCategories = session.permissions.includes(AdminPermissions.SETTINGS_VENDOR_TYPES_READ)
  const canReadFoodTags   = session.permissions.includes(AdminPermissions.SETTINGS_FOOD_TAGS_READ)
  if (!canReadCategories && !canReadFoodTags) redirect("/vendors")

  const { country } = await searchParams
  const { countries, showFilter } = await getFilterableCountries(session.scope.isGlobal)

  const selectedCountry = showFilter ? countries.find((c) => c.slug === country) : undefined
  const scopeLabel = session.scope.isGlobal
    ? (selectedCountry ? selectedCountry.name : "All countries")
    : (countries[0]?.name ?? "your country")

  const countryQuery = selectedCountry ? `countryId=${selectedCountry.id}` : ""

  const [adoption, cuisines, dietaryTags] = await Promise.all([
    canReadCategories
      ? adminFetch<VendorTypeAdoptionResult>(
          `/admin/v1/vendor-types/adoption?limit=50${countryQuery ? `&${countryQuery}` : ""}`,
          { next: { revalidate: 60, tags: ["vendor-type-adoption"] } },
        ).catch(() => ({ total: 0, items: [], others: null }) as VendorTypeAdoptionResult)
      : Promise.resolve(null),
    canReadFoodTags
      ? adminFetch<FoodTagAdoptionResult>(
          `/admin/v1/food-tags/cuisines/adoption?${countryQuery}`,
          { next: { revalidate: 60, tags: ["food-tag-adoption"] } },
        ).catch(() => null)
      : Promise.resolve(null),
    canReadFoodTags
      ? adminFetch<FoodTagAdoptionResult>(
          `/admin/v1/food-tags/dietary-tags/adoption?${countryQuery}`,
          { next: { revalidate: 60, tags: ["food-tag-adoption"] } },
        ).catch(() => null)
      : Promise.resolve(null),
  ])

  return (
    <div className="page-content animate-slide-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="icon-badge icon-badge-primary h-10 w-10">
            <PieChart className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Catalog adoption</h1>
            <p className="text-sm text-muted-foreground">
              What vendors picked from the vocabulary we curate — {scopeLabel}.
            </p>
          </div>
        </div>
        {showFilter && (
          <VendorCategoryCountrySelect
            options={countries.map((c) => ({ slug: c.slug, name: c.name }))}
            selected={selectedCountry?.slug ?? "all"}
          />
        )}
      </div>

      {adoption && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-start">
          <AdoptionDonutChart data={toTopFive(adoption)} scopeLabel={scopeLabel} />
          <VendorCategoryAdoptionTable data={adoption} />
        </div>
      )}

      {/* Cuisines first: a vendor picks up to five, so it is the richer signal
          and the one a launch team actually acts on. Dietary tags are a shorter
          list of claims, so they sit beside it rather than above. */}
      {canReadFoodTags && (
        <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
          <FoodTagAdoptionPanel
            kind="cuisines"
            icon={Utensils}
            data={cuisines}
            scopeLabel={scopeLabel}
            {...(selectedCountry ? { countrySlug: selectedCountry.slug } : {})}
          />
          <FoodTagAdoptionPanel
            kind="dietary-tags"
            icon={Leaf}
            data={dietaryTags}
            scopeLabel={scopeLabel}
            {...(selectedCountry ? { countrySlug: selectedCountry.slug } : {})}
          />
        </div>
      )}
    </div>
  )
}
