import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import { BackButton } from "@/components/shared/BackButton"
import Link from "next/link"
import { MapPin, Store, CheckCircle, PauseCircle, Ban, FileText, Clock, Map as MapIcon, ChevronRight } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { CityActions } from "@/components/cities/CityActions"
import { AdminPermissions } from "@repo/types/admin-app"
import type { CityDetail, CityOutletSnapshot } from "@repo/types/admin-app"
import type { CityCountryLite } from "@/types/city.types"

export const metadata: Metadata = { title: "City" }

interface Props { params: Promise<{ citySlug: string }> }

function StatusBadge({ status }: { status: string }) {
  return status === "ACTIVE"
    ? <span className="badge-success">Active</span>
    : <span className="badge-neutral">Inactive</span>
}

export default async function CityDetailPage({ params }: Props) {
  const { citySlug } = await params
  const session = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_READ)) redirect("/overview")

  // /countries/[slug]/documents is restricted to super_admin + the global
  // operations_admin (same guard as every /countries/[slug]/... page) — a
  // SETTINGS_GEOGRAPHY_READ-only viewer of this city page (e.g. identity_admin)
  // would otherwise hit that page's redirect. Only link there when it'd
  // actually work.
  const canViewCountryDocuments = session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE) && session.scope.isGlobal
  const canViewGeography =
    session.permissions.includes(AdminPermissions.SETTINGS_ZONES_READ) ||
    session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE)

  let city: CityDetail
  try {
    city = await adminFetch<CityDetail>(`/admin/v1/cities/${citySlug}`, {
      next: { revalidate: 60, tags: [`city-${citySlug}`] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const [snapshot, country] = await Promise.all([
    adminFetch<CityOutletSnapshot>(`/admin/v1/cities/${citySlug}/outlets-snapshot`, {
      next: { revalidate: 60, tags: [`city-${citySlug}-snapshot`] },
    }).catch(() => null),
    adminFetch<CityCountryLite>(`/admin/v1/countries/${city.countryId}`, {
      next: { revalidate: 300, tags: [`country-${city.countryId}`] },
    }).catch(() => null),
  ])

  const canWrite = session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE)

  const outletCards = [
    { label: "Total Outlets", count: snapshot?.outlets.total ?? 0,     icon: Store,        badgeClass: "icon-badge-primary" },
    { label: "Active",        count: snapshot?.outlets.active ?? 0,    icon: CheckCircle,  badgeClass: "icon-badge-success" },
    { label: "Suspended",     count: snapshot?.outlets.suspended ?? 0, icon: PauseCircle,  badgeClass: "icon-badge-warning" },
    { label: "Banned",        count: snapshot?.outlets.banned ?? 0,    icon: Ban,          badgeClass: "icon-badge-danger" },
  ]

  return (
    <div className="page-content animate-slide-up">
      <BackButton href="/cities">Back to Cities</BackButton>

      {/* Header card */}
      <div className="admin-card flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="icon-badge icon-badge-primary h-14 w-14 shrink-0">
            <MapPin className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold text-foreground">{city.name}</h1>
            <p className="text-sm text-muted-foreground">
              {country
                ? (
                  <Link href={`/countries/${country.slug}`} className="font-medium text-primary hover:underline">
                    {country.name}
                  </Link>
                )
                : "Country unavailable"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={city.status} />
              {city.code && <span className="badge-neutral">{city.code}</span>}
              <span className="badge-neutral inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {city.timezone}
              </span>
            </div>
          </div>
        </div>

        <CityActions city={city} canWrite={canWrite} />
      </div>

      {/* Outlet snapshot */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {outletCards.map(({ label, count, icon: Icon, badgeClass }) => (
          <div key={label} className="stat-card">
            <div className={`icon-badge h-12 w-12 ${badgeClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="stat-card-value">{count}</p>
              <p className="stat-card-label">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Geography & zones */}
      {canViewGeography && (
        <Link
          href={`/cities/${citySlug}/geography`}
          className="admin-card group flex items-center justify-between gap-4 transition-colors hover:border-primary/40"
        >
          <div className="flex items-center gap-3">
            <div className="icon-badge icon-badge-primary h-10 w-10">
              <MapIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Operational geography</p>
              <p className="text-xs text-muted-foreground">
                City boundary and operational zones — where outlets may exist and what can happen where.
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      {/* Document types */}
      <div className="admin-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="icon-badge icon-badge-info h-10 w-10">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {snapshot?.documentTypes ?? 0} document type{(snapshot?.documentTypes ?? 0) === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-muted-foreground">Onboarding documents applicable to this city.</p>
          </div>
        </div>
        {country && canViewCountryDocuments && (
          <Link href={`/countries/${country.slug}/documents`} className="view-all-link">
            View documents
          </Link>
        )}
      </div>
    </div>
  )
}
