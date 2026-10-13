import { redirect } from "next/navigation"
import { Receipt, AlertTriangle } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { getFilterableCountries } from "@/lib/countries/filterable-countries"
import { getScopeTier } from "@/lib/auth/scope-tier"
import { EmptyState } from "@/components/shared/EmptyState"
import { TaxCountrySelect } from "./TaxCountrySelect"
import { CountryTaxPositionCard } from "./CountryTaxPositionCard"
import { CountryTaxRatesCard } from "./CountryTaxRatesCard"
import { TaxPreviewCard } from "./TaxPreviewCard"
import type { CountryTaxSettings, TaxCategory } from "@/types/tax.types"

/*
 * One country's tax position and its rates.
 *
 * Country-scoped by construction, which is the answer to "is tax country
 * scoped": a country-scoped admin has no picker at all and their own market is
 * resolved server-side, exactly like every other country-scoped screen. Only a
 * global admin chooses which market to look at. getFilterableCountries already
 * returns a scope-narrowed list, and the backend re-checks the country against
 * the caller's scope regardless of what the page sends.
 */

interface Props {
  searchParams: Promise<{ country?: string }>
}

export async function CountryTaxManager({ searchParams }: Props) {
  const session = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.FINANCE_TAX_READ)) redirect("/overview")

  /*
   * A country's tax position is country-WIDE policy, so a city-tier admin only
   * ever reads it. The backend refuses them too (assertCountryTaxScope); this
   * stops rendering controls that could only 403.
   */
  const canManage =
    session.permissions.includes(AdminPermissions.FINANCE_TAX_MANAGE) &&
    getScopeTier(session) !== "CITY"

  const params = await searchParams
  const { countries, showFilter } = await getFilterableCountries(session.scope.isGlobal)

  // A country-scoped admin is locked to their own market; a global admin picks
  // one, and until they do there is nothing country-specific to show.
  const selected = showFilter
    ? countries.find((c) => c.slug === params.country) ?? null
    : countries[0] ?? null

  if (!selected) {
    return (
      <div className="flex flex-col gap-6">
        <Header showFilter={showFilter} countries={countries} selectedSlug={params.country} />
        <EmptyState
          icon={Receipt}
          title="Pick a country"
          description="Tax is set per market. Choose one above to see how its prices are quoted and what it charges."
        />
      </div>
    )
  }

  const [settings, categories] = await Promise.all([
    adminFetch<CountryTaxSettings>(`/admin/v1/tax/countries/${selected.slug}`, {
      next: { revalidate: 60, tags: ["tax-country"] },
    }).catch(() => null),
    adminFetch<TaxCategory[]>("/admin/v1/tax/categories", {
      next: { revalidate: 300, tags: ["tax-categories"] },
    }).catch(() => null),
  ])

  if (!settings || !categories) {
    return (
      <div className="flex flex-col gap-6">
        <Header showFilter={showFilter} countries={countries} selectedSlug={selected.slug} />
        <div className="admin-card border-destructive/40 p-6">
          <p className="text-sm font-medium text-destructive">
            Couldn&apos;t load {selected.name}&apos;s tax settings.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            The request failed rather than coming back empty.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Header showFilter={showFilter} countries={countries} selectedSlug={selected.slug} />

      {/*
        * Without a standard rate nothing in this market can be broken down at
        * all — the vendor form falls back to showing no tax line. That is the
        * single most important thing to say on this page, so it leads.
        */}
      {!settings.hasStandardRate && (
        <div className="admin-card flex items-start gap-3 border-warning/40 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-medium text-foreground">No standard rate set for {selected.name}.</p>
            <p className="mt-1 text-muted-foreground">
              Until one exists, no meal price in this market can be split into net and tax, and vendors
              see no tax line at all. Set the rate that applies to ordinary prepared food and mark it as
              the default.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CountryTaxPositionCard
            countrySlug={selected.slug}
            countryName={selected.name}
            settings={settings}
            canManage={canManage}
          />
        </div>
        <TaxPreviewCard
          settings={settings}
          currencyCode={selected.currency ?? "USD"}
        />
      </div>

      <CountryTaxRatesCard
        countrySlug={selected.slug}
        countryName={selected.name}
        settings={settings}
        categories={categories}
        canManage={canManage}
      />
    </div>
  )
}

function Header({
  showFilter, countries, selectedSlug,
}: {
  showFilter  : boolean
  countries   : { id: string; name: string; slug: string }[]
  selectedSlug: string | undefined
}) {
  return (
    <PageHeader
      icon={Receipt}
      title="Country tax"
      description="How prices are quoted in one market, who remits, and what it charges"
      actions={
        showFilter ? (
          <TaxCountrySelect
            countries={countries.map((c) => ({ value: c.slug, label: c.name }))}
            selected={selectedSlug}
          />
        ) : undefined
      }
    />
  )
}
