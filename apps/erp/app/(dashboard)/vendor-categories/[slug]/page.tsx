import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import { BackButton } from "@/components/shared/BackButton"
import Link from "next/link"
import { Tag, Building2, CheckCircle2, Ban, TrendingUp, ArrowUpRight, ArrowDownRight, Store } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { VendorCategoryStatusBadge } from "@/components/vendor-categories/VendorCategoryStatusBadge"
import { VendorCategoryStatusAction } from "@/components/vendor-categories/VendorCategoryStatusAction"
import { VendorCategoryFormSheet } from "@/components/vendor-categories/VendorCategoryFormSheet"
import { VendorCategoryCountryBreakdown } from "@/components/vendor-categories/VendorCategoryCountryBreakdown"
import { SectionViewMoreHeader } from "@/components/countries/SectionViewMoreHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { getInitials } from "@/lib/initials"
import { getFilterableCountries } from "@/lib/countries/filterable-countries"
import { getMockVendorTypeRevenueTotal } from "@/lib/mock/vendor-type-revenue"
import { formatMockCurrency } from "@/lib/mock/country-revenue"
import type { VendorTypeDetail, VendorTypeStats } from "@/types/vendor-type.types"
import type { VendorListResult } from "@/types"

export const metadata: Metadata = { title: "Vendor Category" }

interface Props { params: Promise<{ slug: string }> }

function VendorStatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    ACTIVE   : "badge-success",
    SUSPENDED: "badge-warning",
    BANNED   : "badge-danger",
  }
  const label: Record<string, string> = {
    ACTIVE   : "Active",
    SUSPENDED: "Suspended",
    BANNED   : "Banned",
  }
  return <span className={cls[status] ?? "badge-neutral"}>{label[status] ?? status}</span>
}

export default async function VendorCategoryDetailPage({ params }: Props) {
  const { slug } = await params
  const session = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.SETTINGS_VENDOR_TYPES_READ)) redirect("/vendors")

  const canWrite = session.scope.isGlobal
    && session.permissions.includes(AdminPermissions.SETTINGS_VENDOR_TYPES_WRITE)
  // /finance/vendor-categories is gated on FINANCE_REPORTS_READ — see
  // vendor-categories/page.tsx's identical guard for why this link is
  // conditional.
  const canReadFinance = session.permissions.includes(AdminPermissions.FINANCE_REPORTS_READ)

  let vendorCategory: VendorTypeDetail
  try {
    vendorCategory = await adminFetch<VendorTypeDetail>(`/admin/v1/vendor-types/${slug}`, {
      next: { revalidate: 60, tags: [`vendor-type-${slug}`] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const [{ countries: allCountries }, stats, vendorsPreview] = await Promise.all([
    getFilterableCountries(session.scope.isGlobal),
    // Scope-aware server-side (see admin.vendorType.service.ts's getVendorTypeStats)
    // — a country-scoped admin's totals already only cover their own country.
    adminFetch<VendorTypeStats>(`/admin/v1/vendor-types/${slug}/stats`, {
      next: { revalidate: 60, tags: [`vendor-type-${slug}-stats`] },
    }).catch(() => null),
    // listVendorAccounts applies the caller's AdminScopeContext on every
    // call regardless of filters passed — a country-scoped admin's preview
    // here is already confined to their own country's vendors of this
    // category, no extra param needed.
    adminFetch<VendorListResult>(`/admin/v1/vendors/accounts?vendorTypeId=${vendorCategory.id}&pageSize=5`, {
      next: { revalidate: 60, tags: [`vendor-type-${slug}-vendors`] },
    }).catch(() => null),
  ])

  // Country-scoped admin: their own country stands in for the mock
  // revenue's scope key — same simplification as the Adoption/Revenue
  // pages (first country if they somehow hold more than one COUNTRY scope
  // row). Global: system-wide aggregate, matching the catalog page default.
  const ownCountry = !session.scope.isGlobal ? allCountries[0] : undefined
  const scopeLabel = session.scope.isGlobal ? "all countries" : (ownCountry?.name ?? "your country")
  const revenueScopeKey = session.scope.isGlobal ? "all" : (ownCountry?.slug ?? "all")

  // STATIC — no Orders/Payments model exists yet, see lib/mock/vendor-type-revenue.ts.
  const revenue = getMockVendorTypeRevenueTotal(vendorCategory.id, revenueScopeKey)

  return (
    <div className="page-content animate-slide-up">

      <BackButton href="/vendor-categories">Back to Vendor Categories</BackButton>

      <div className="admin-card flex items-center gap-4">
        <div className="icon-badge icon-badge-primary h-14 w-14 shrink-0">
          <Tag className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-semibold text-foreground">{vendorCategory.name}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {vendorCategory.description || "No description"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <VendorCategoryStatusBadge status={vendorCategory.status} />
          {canWrite && (
            <>
              <VendorCategoryFormSheet vendorCategory={vendorCategory} />
              <VendorCategoryStatusAction slug={vendorCategory.slug} name={vendorCategory.name} status={vendorCategory.status} />
            </>
          )}
        </div>
      </div>

      {/* Headline stats — real vendor-account counts + illustrative revenue */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="stat-card">
          <div className="icon-badge icon-badge-primary h-12 w-12">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="stat-card-value">{stats?.total ?? 0}</p>
            <p className="stat-card-label">Vendor Accounts</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="icon-badge icon-badge-success h-12 w-12">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="stat-card-value">{stats?.active ?? 0}</p>
            <p className="stat-card-label">Active</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="icon-badge icon-badge-warning h-12 w-12">
            <Ban className="h-5 w-5" />
          </div>
          <div>
            <p className="stat-card-value">{stats?.suspended ?? 0}</p>
            <p className="stat-card-label">Suspended</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="icon-badge icon-badge-info h-12 w-12">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <p className="stat-card-value">{formatMockCurrency(revenue)}</p>
            <p className="stat-card-label">Revenue — Last Quarter</p>
          </div>
        </div>
      </div>
      <p className="-mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>Revenue is illustrative ({scopeLabel}) — replace once Orders/Payments ships.</span>
        {canReadFinance && (
          <Link href={`/finance/vendor-categories?type=${vendorCategory.slug}`} className="view-all-link">
            View revenue trend →
          </Link>
        )}
      </p>

      <VendorCategoryCountryBreakdown
        vendorTypeSlug={vendorCategory.slug}
        countries={vendorCategory.countries}
        allCountries={allCountries}
        canWrite={canWrite}
        subtitle={session.scope.isGlobal
          ? "Where this category is available, and how many vendors use it."
          : `Vendors using this category in ${scopeLabel}.`}
      />

      {/* Vendor accounts preview — already scope-correct (see the fetch
          above); the header just makes that visible so a country-scoped
          admin isn't left wondering whether this is a global list. */}
      <div className="admin-card space-y-4">
        <SectionViewMoreHeader
          title={session.scope.isGlobal ? "Vendor Accounts" : `Vendor Accounts — ${scopeLabel}`}
          href={`/vendor-categories/${vendorCategory.slug}/vendors`}
        />

        {!vendorsPreview || vendorsPreview.accounts.length === 0 ? (
          <EmptyState
            icon={Store}
            title="No vendor accounts yet"
            description="Vendors that select this category during onboarding will show up here."
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {vendorsPreview.accounts.map((acc) => (
              <li key={acc.id}>
                <Link href={`/vendors/accounts/${acc.id}`} className="group flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="avatar-circle h-9 w-9 text-xs">
                      {getInitials(acc.legalBusinessName)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                        {acc.legalBusinessName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{acc.country?.name ?? "—"}</p>
                    </div>
                  </div>
                  <VendorStatusBadge status={acc.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
