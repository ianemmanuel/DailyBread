import { BackButton } from "@/components/shared/BackButton"
import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { CountryFinancialConfigManager } from "@/components/finance/CountryFinancialConfigManager"
import { AdminPermissions } from "@repo/types/admin-app"
import type {
  Country,
  CountryFinancialConfigView,
  PaymentProviderListResult,
} from "@repo/types/admin-app"

export const revalidate = 30

interface Props { params: Promise<{ countrySlug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug } = await params
  return { title: `Financial Configuration — ${countrySlug}` }
}

/*
 * Country configuration, not financial activity/reporting — moved here from
 * /finance/countries/[slug] (Countries + Finance IA restructuring). Reuses
 * CountryFinancialConfigManager and the existing /api/finance/countries/*
 * proxy routes unchanged; only the page's location and back-link moved.
 * Deliberately gated on FINANCE_CONFIGURATION_READ, NOT the Country
 * Command Center's SETTINGS_GEOGRAPHY_WRITE gate — nesting under
 * /countries/[slug] must not turn into an authorization hierarchy. A
 * finance-role global admin who lacks settings:geography:write continues
 * to reach this page directly; they just won't see it linked from the
 * Command Center (which stays gated as before).
 */
export default async function CountryFinancePage({ params }: Props) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.FINANCE_CONFIGURATION_READ)) redirect("/overview")

  const { countrySlug } = await params

  let country: Country
  try {
    country = await adminFetch<Country>(`/admin/v1/countries/${countrySlug}`, {
      next: { revalidate: 30, tags: [`country-${countrySlug}`] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const [view, providers] = await Promise.all([
    adminFetch<CountryFinancialConfigView>(`/admin/v1/finance/countries/${countrySlug}/financial-config`, {
      // The broad `finance-country-config` tag lets mutations that only know
      // the country id (payment-method wiring / config on the Payment Methods
      // page) invalidate this view without resolving the slug — the view
      // embeds the payment-method list, so the two pages must not drift.
      next: { revalidate: 30, tags: [`finance-country-config-${countrySlug}`, "finance-country-config"] },
    }).catch(() => null),
    adminFetch<PaymentProviderListResult>("/admin/v1/finance/providers?status=ACTIVE&pageSize=100", {
      next: { revalidate: 300, tags: ["finance-providers"] },
    }).then((r) => r.providers).catch(() => []),
  ])

  if (!view) notFound()

  return (
    <div className="page-content animate-slide-up">
      <BackButton href={`/countries/${country.slug}`}>Back to {country.name}</BackButton>

      <CountryFinancialConfigManager
        countrySlug={countrySlug}
        countryName={country.name}
        countryStatus={country.status}
        view={view}
        providers={providers}
      />
    </div>
  )
}
