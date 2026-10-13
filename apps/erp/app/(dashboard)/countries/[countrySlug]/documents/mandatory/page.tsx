import { BackButton } from "@/components/shared/BackButton"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { AlertTriangle } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { assertDocumentsHomeAccess, assertCountryInDocumentsScope } from "@/lib/countries/documents-access"
import { ActiveDocumentsTable } from "@/components/document-types/ActiveDocumentsTable"
import type { Country } from "@repo/types/admin-app"
import type { DocumentTypeListResult } from "@/types/document-type.types"

export const revalidate = 60
const PAGE_SIZE = 10

interface Props {
  params: Promise<{ countrySlug: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug } = await params
  return { title: `Mandatory documents — ${countrySlug}` }
}

export default async function MandatoryDocumentsPage({ params, searchParams }: Props) {
  const session = await getAdminSession()
  const { canWrite } = assertDocumentsHomeAccess(session)

  const { countrySlug } = await params
  const { page = "1" } = await searchParams

  let country: Country
  try {
    country = await adminFetch<Country>(`/admin/v1/countries/${countrySlug}`, { next: { revalidate: 60, tags: [`country-${countrySlug}`] } })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }
  assertCountryInDocumentsScope(session, country.id)

  const result = await adminFetch<DocumentTypeListResult>(
    `/admin/v1/document-types?countryId=${country.id}&status=ACTIVE&isRequired=true&page=${page}&pageSize=${PAGE_SIZE}`,
    { next: { revalidate: 60, tags: [`document-types-${country.id}`] } },
  ).catch(() => null)

  return (
    <div className="page-content animate-slide-up">
      <BackButton href={`/countries/${country.slug}/documents`}>Back to Documents</BackButton>

      <div className="admin-card flex items-center gap-4">
        <div className="icon-badge icon-badge-warning h-12 w-12">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Mandatory Documents</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Vendors in {country.name} must upload these to complete onboarding.</p>
        </div>
      </div>

      <ActiveDocumentsTable
        result={result}
        page={page}
        countryId={country.id}
        countrySlug={country.slug}
        basePath={`/countries/${country.slug}/documents/mandatory`}
        canWrite={canWrite}
        emptyTitle="No mandatory documents"
        emptyDescription="Documents marked mandatory in this country will show up here."
      />
    </div>
  )
}
