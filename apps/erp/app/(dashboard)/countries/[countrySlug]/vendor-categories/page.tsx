import { BackButton } from "@/components/shared/BackButton"
import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import { Tag } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { CountryVendorCategoriesManager } from "@/components/countries/CountryVendorCategoriesManager"
import { AdminPermissions } from "@repo/types/admin-app"
import type { Country } from "@repo/types/admin-app"
import type { CountryVendorTypeLink, VendorType, VendorTypeListResult } from "@/types/vendor-type.types"

export const revalidate = 60

interface Props { params: Promise<{ countrySlug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug } = await params
  return { title: `Vendor Categories — ${countrySlug}` }
}

export default async function CountryVendorCategoriesPage({ params }: Props) {
  const session = await getAdminSession()

  // Same restriction as every other /countries/[slug]/... page — see /countries/page.tsx.
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

  const [countryVendorTypes, allVendorTypesResult] = await Promise.all([
    adminFetch<CountryVendorTypeLink[]>(`/admin/v1/countries/${countrySlug}/vendor-types`, {
      next: { revalidate: 60, tags: [`country-${countrySlug}`] },
    }).catch(() => [] as CountryVendorTypeLink[]),
    adminFetch<VendorTypeListResult>(`/admin/v1/vendor-types?pageSize=200`, {
      next: { revalidate: 120, tags: ["vendor-types"] },
    }).catch(() => null),
  ])

  const allVendorTypes: VendorType[] = allVendorTypesResult?.vendorTypes ?? []
  const canWrite = session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE)

  return (
    <div className="page-content animate-slide-up">
      <BackButton href={`/countries/${country.slug}`}>Back to {country.name}</BackButton>

      <div className="admin-card flex items-center gap-4">
        <div className="icon-badge icon-badge-primary h-12 w-12">
          <Tag className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Vendor Categories</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Which vendor categories {country.name} supports, and how many vendors operate under each.
          </p>
        </div>
      </div>

      <CountryVendorCategoriesManager
        countrySlug={country.slug}
        vendorTypes={countryVendorTypes}
        allVendorTypes={allVendorTypes}
        canWrite={canWrite}
      />
    </div>
  )
}
