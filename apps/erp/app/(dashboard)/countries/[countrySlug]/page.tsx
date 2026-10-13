import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import { BackButton } from "@/components/shared/BackButton"
import { Flag, Building2, Store, Coins, Globe2, MapPinned } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { getMockCountryRevenue } from "@/lib/mock/country-revenue"
import { CountryActions } from "@/components/countries/CountryActions"
import { CountryLaunchChecklist } from "@/components/countries/CountryLaunchChecklist"
import { CountryFinanceLinks } from "@/components/countries/CountryFinanceLinks"
import { CountryVendorCategoriesPreview } from "@/components/countries/CountryVendorCategoriesPreview"
import { CountryDocumentsPreview } from "@/components/countries/CountryDocumentsPreview"
import { CountryReadinessActions } from "@/components/countries/CountryReadinessActions"
import { CountryInspectionPolicy } from "@/components/countries/CountryInspectionPolicy"
import { SectionViewMoreHeader } from "@/components/countries/SectionViewMoreHeader"
import { CountryVendorAccountsSummary } from "@/components/countries/CountryVendorAccountsSummary"
import { CountryVendorApplicationsSummary } from "@/components/countries/CountryVendorApplicationsSummary"
import { RevenueStatCard } from "@/components/countries/RevenueStatCard"
import { CountryCitiesPreview, type CityPreviewEntry } from "@/components/countries/CountryCitiesPreview"
import { AdminPermissions } from "@repo/types/admin-app"
import type { Country, CountryVendorSnapshot, CityOutletLeaderboardEntry } from "@repo/types/admin-app"
import type { DocumentTypeConfig } from "@/types/document-type.types"
import type { CountryVendorTypeLink } from "@/types/vendor-type.types"

export const revalidate = 60

interface Props { params: Promise<{ countrySlug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug } = await params
  return { title: countrySlug }
}

function StatusBadge({ status }: { status: string }) {
  return status === "ACTIVE"
    ? <span className="badge-success">Active</span>
    : <span className="badge-neutral">Inactive</span>
}

interface DocumentTypeListResult {
  documentTypes: DocumentTypeConfig[]
  total: number
}

export default async function CountryDetailPage({ params }: Props) {
  const session = await getAdminSession()

  // Countries (launch configuration) is restricted to super_admin and the
  // (currently global-only) operations_admin role — see /countries/page.tsx.
  if (!session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE) || !session.scope.isGlobal) {
    redirect("/overview")
  }

  const { countrySlug } = await params

  let country: Country
  try {
    country = await adminFetch<Country>(`/admin/v1/countries/${countrySlug}`, {
      next: { revalidate: 60, tags: [`country-${countrySlug}`] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const [vendorSnapshot, cityLeaderboard, documentTypesResult, countryVendorTypes] = await Promise.all([
    adminFetch<CountryVendorSnapshot>(`/admin/v1/countries/${countrySlug}/vendors`, {
      next: { revalidate: 60, tags: [`country-${countrySlug}-vendors`] },
    }).catch(() => null),
    adminFetch<CityOutletLeaderboardEntry[]>(`/admin/v1/countries/${countrySlug}/cities/leaderboard`, {
      next: { revalidate: 60, tags: [`country-${countrySlug}-cities-leaderboard`] },
    }).catch(() => [] as CityOutletLeaderboardEntry[]),
    adminFetch<DocumentTypeListResult>(`/admin/v1/document-types?countryId=${country.id}&pageSize=5`, {
      next: { revalidate: 60, tags: [`document-types-${country.id}`] },
    }).catch(() => null),
    adminFetch<CountryVendorTypeLink[]>(`/admin/v1/countries/${countrySlug}/vendor-types`, {
      next: { revalidate: 60, tags: [`country-${countrySlug}`] },
    }).catch(() => [] as CountryVendorTypeLink[]),
  ])

  const canWrite = session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE)
  const checklist = country.checklist ?? {
    vendorTypeCount: 0, documentTypeCount: 0, outboundPaymentMethodCount: 0, inboundPaymentMethodCount: 0, cityCount: 0,
    financiallyReady: false, financialReadinessReasons: [], readyToActivate: false,
  }

  const cityPreviewEntries: CityPreviewEntry[] = cityLeaderboard.length > 0
    ? cityLeaderboard.slice(0, 5).map((c) => ({ name: c.name, count: c.count }))
    : country.cities.slice(0, 5).map((c) => ({ name: c.name, count: null }))

  return (
    <div className="page-content animate-slide-up">

      <BackButton href="/countries">Back to Countries</BackButton>

      {/* Hero */}
      <div className="admin-card flex flex-wrap items-center gap-4">
        <div className="icon-badge icon-badge-primary h-14 w-14 shrink-0">
          <Flag className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-semibold text-foreground">{country.name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Globe2 className="h-3.5 w-3.5" />{country.code} · {country.phoneCode}</span>
            <span className="inline-flex items-center gap-1"><Coins className="h-3.5 w-3.5" />{country.currency}{country.currencySymbol ? ` (${country.currencySymbol})` : ""}</span>
            {country.region && (
              <span className="inline-flex items-center gap-1"><MapPinned className="h-3.5 w-3.5" />{country.region.name}</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <StatusBadge status={country.status} />
          <span className={country.readyForVendorOnboarding ? "badge-success" : "badge-neutral"}>
            {country.readyForVendorOnboarding ? "Ready for Vendors" : "Vendors Not Ready"}
          </span>
          <span className={country.readyForCustomerOperations ? "badge-success" : "badge-neutral"}>
            {country.readyForCustomerOperations ? "Ready for Customers" : "Customers Not Ready"}
          </span>
          <CountryActions
            countrySlug={country.slug}
            countryName={country.name}
            status={country.status}
            canWrite={canWrite}
            isGlobal={session.scope.isGlobal}
            canActivate={checklist.readyToActivate}
            size="default"
          />
        </div>
      </div>

      <CountryLaunchChecklist
        vendorTypeCount={checklist.vendorTypeCount}
        documentTypeCount={checklist.documentTypeCount}
        outboundPaymentMethodCount={checklist.outboundPaymentMethodCount}
        cityCount={checklist.cityCount}
        readyToActivate={checklist.readyToActivate}
        status={country.status}
        countrySlug={country.slug}
        currency={country.currency}
        currencySymbol={country.currencySymbol}
      />

      <CountryReadinessActions
        countrySlug={country.slug}
        countryName={country.name}
        readyForVendorOnboarding={country.readyForVendorOnboarding}
        readyForCustomerOperations={country.readyForCustomerOperations}
        checklistReady={checklist.readyToActivate}
        hasInboundPaymentMethod={checklist.inboundPaymentMethodCount > 0}
        canWrite={canWrite}
        isGlobal={session.scope.isGlobal}
      />

      <CountryInspectionPolicy
        countrySlug={country.slug}
        current={country.outletInspectionPolicy ?? "MEAL_PLAN_ONLY"}
        canWrite={canWrite}
      />

      {/* Headline stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="stat-card">
          <div className="icon-badge icon-badge-primary h-12 w-12">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="stat-card-value">{country._count?.cities ?? country.cities.length}</p>
            <p className="stat-card-label">Cities</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="icon-badge icon-badge-success h-12 w-12">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <p className="stat-card-value">{country._count?.vendors ?? 0}</p>
            <p className="stat-card-label">Vendors</p>
          </div>
        </div>
        <RevenueStatCard revenue={getMockCountryRevenue(country.slug)} />
      </div>

      {/* Vendors — accounts and applications get their own minimal cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="admin-card space-y-3">
          <SectionViewMoreHeader title="Vendors" href={`/countries/${country.slug}/vendors`} />
          <CountryVendorAccountsSummary snapshot={vendorSnapshot} />
        </div>
        <div className="admin-card space-y-3">
          <SectionViewMoreHeader title="Vendor Applications" href={`/countries/${country.slug}/vendor-applications`} />
          <CountryVendorApplicationsSummary snapshot={vendorSnapshot} />
        </div>
      </div>

      {/* Cities */}
      <div className="admin-card space-y-3">
        <SectionViewMoreHeader title="Cities" href={`/countries/${country.slug}/cities`} />
        <CountryCitiesPreview entries={cityPreviewEntries} />
      </div>

      {/* Vendor categories + documents — read-only previews, capped at 5 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="admin-card space-y-3">
          <SectionViewMoreHeader title="Vendor Categories" href={`/countries/${country.slug}/vendor-categories`} />
          <CountryVendorCategoriesPreview vendorTypes={countryVendorTypes} />
        </div>
        <div className="admin-card space-y-3">
          <SectionViewMoreHeader title="Documents" href={`/countries/${country.slug}/documents`} />
          <CountryDocumentsPreview documentTypes={documentTypesResult?.documentTypes ?? []} />
        </div>
      </div>

      {/* Finance — hub links only, never the configuration forms themselves.
          Financial Configuration and Payment Methods stay two dedicated
          pages with their own permissions (Countries + Finance IA
          restructuring); this card just connects them. */}
      <div className="admin-card space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Finance</h2>
        <CountryFinanceLinks
          countrySlug={country.slug}
          financiallyReady={checklist.financiallyReady}
          outboundPaymentMethodCount={checklist.outboundPaymentMethodCount}
          inboundPaymentMethodCount={checklist.inboundPaymentMethodCount}
        />
      </div>

    </div>
  )
}
