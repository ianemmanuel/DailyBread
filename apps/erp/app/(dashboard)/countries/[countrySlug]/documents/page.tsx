import { BackButton } from "@/components/shared/BackButton"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { FileText } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { assertDocumentsHomeAccess, assertCountryInDocumentsScope } from "@/lib/countries/documents-access"
import { SectionViewMoreHeader } from "@/components/countries/SectionViewMoreHeader"
import { DocumentTypeFormSheet } from "@/components/document-types/DocumentTypeFormSheet"
import { DocumentVendorCategoryGroups } from "@/components/document-types/DocumentVendorCategoryGroups"
import { CountryDocumentsPreview } from "@/components/countries/CountryDocumentsPreview"
import type { Country } from "@repo/types/admin-app"
import type { DocumentTypeListResult } from "@/types/document-type.types"

export const revalidate = 60

interface Props { params: Promise<{ countrySlug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug } = await params
  return { title: `Documents — ${countrySlug}` }
}

async function fetchDocs(countryId: string, query: string) {
  return adminFetch<DocumentTypeListResult>(`/admin/v1/document-types?countryId=${countryId}&${query}`, {
    next: { revalidate: 60, tags: [`document-types-${countryId}`] },
  }).catch(() => null)
}

export default async function CountryDocumentsHubPage({ params }: Props) {
  const session = await getAdminSession()

  const { canWrite } = assertDocumentsHomeAccess(session)

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
  assertCountryInDocumentsScope(session, country.id)

  const [allActive, mandatory, optional, vendorScoped, outletScoped, cityScoped, deactivated] = await Promise.all([
    fetchDocs(country.id, "status=ACTIVE&pageSize=15"),
    fetchDocs(country.id, "status=ACTIVE&isRequired=true&pageSize=5"),
    fetchDocs(country.id, "status=ACTIVE&isRequired=false&pageSize=5"),
    fetchDocs(country.id, "status=ACTIVE&scope=VENDOR&pageSize=5"),
    fetchDocs(country.id, "status=ACTIVE&scope=OUTLET&pageSize=5"),
    fetchDocs(country.id, "status=ACTIVE&scope=CITY&pageSize=5"),
    fetchDocs(country.id, "status=INACTIVE&pageSize=5"),
  ])

  return (
    <div className="page-content animate-slide-up">
      <BackButton href={`/countries/${country.slug}`}>Back to {country.name}</BackButton>

      <div className="admin-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="icon-badge icon-badge-primary h-12 w-12">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Documents</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Documents required from vendors and outlets in {country.name}.
            </p>
          </div>
        </div>
        {canWrite && <DocumentTypeFormSheet countryId={country.id} />}
      </div>

      <div className="admin-card space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Applies to</h2>
        <p className="text-xs text-muted-foreground">
          Which vendor categories each document requires. No links shown means it applies to every category.
        </p>
        <DocumentVendorCategoryGroups documentTypes={allActive?.documentTypes ?? []} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="admin-card space-y-3">
          <SectionViewMoreHeader title="Mandatory" href={`/countries/${country.slug}/documents/mandatory`} />
          <CountryDocumentsPreview documentTypes={mandatory?.documentTypes ?? []} />
        </div>
        <div className="admin-card space-y-3">
          <SectionViewMoreHeader title="Optional" href={`/countries/${country.slug}/documents/optional`} />
          <CountryDocumentsPreview documentTypes={optional?.documentTypes ?? []} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="admin-card space-y-3">
          <SectionViewMoreHeader title="Vendor-scoped" href={`/countries/${country.slug}/documents/vendors`} />
          <CountryDocumentsPreview documentTypes={vendorScoped?.documentTypes ?? []} />
        </div>
        <div className="admin-card space-y-3">
          <SectionViewMoreHeader title="Outlet-scoped" href={`/countries/${country.slug}/documents/outlets`} />
          <CountryDocumentsPreview documentTypes={outletScoped?.documentTypes ?? []} />
        </div>
        <div className="admin-card space-y-3">
          <SectionViewMoreHeader title="City-scoped" href={`/countries/${country.slug}/documents/city`} />
          <CountryDocumentsPreview documentTypes={cityScoped?.documentTypes ?? []} />
        </div>
      </div>

      <div className="admin-card space-y-3">
        <SectionViewMoreHeader title="Deactivated" href={`/countries/${country.slug}/documents/deactivated`} />
        <CountryDocumentsPreview documentTypes={deactivated?.documentTypes ?? []} />
      </div>
    </div>
  )
}
