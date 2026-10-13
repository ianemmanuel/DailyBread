import { BackButton } from "@/components/shared/BackButton"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { FileText, Clock, ShieldCheck } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { assertDocumentsHomeAccess, assertCountryInDocumentsScope } from "@/lib/countries/documents-access"
import type { Country } from "@repo/types/admin-app"
import { DocumentTypeStatusBadge } from "@/components/document-types/DocumentTypeStatusBadge"
import { DocumentTypeStatusAction } from "@/components/document-types/DocumentTypeStatusAction"
import { DocumentTypeFormDialog } from "@/components/document-types/DocumentTypeFormDialog"
import { DocumentTypeVendorTypeManager } from "@/components/document-types/DocumentTypeVendorTypeManager"
import { scopeLabel } from "@/components/document-types/ActiveDocumentsTable"
import type { DocumentTypeConfig } from "@/types/document-type.types"
import type { VendorType, VendorTypeListResult } from "@/types/vendor-type.types"

export const revalidate = 60

interface Props { params: Promise<{ countrySlug: string; documentTypeId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { documentTypeId } = await params
  return { title: `Document — ${documentTypeId}` }
}

export default async function CountryDocumentDetailPage({ params }: Props) {
  const session = await getAdminSession()

  // Documents are country configuration, not a "vendors" concept, so this
  // follows the countries hierarchy's access policy — either global +
  // SETTINGS_GEOGRAPHY_WRITE, or a country-scoped admin holding
  // SETTINGS_DOCUMENTS_READ for their own country (CLAUDE.md's
  // "Countries depth" decision; see assertDocumentsHomeAccess).
  const { canWrite } = assertDocumentsHomeAccess(session)

  const { countrySlug, documentTypeId } = await params

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

  let documentType: DocumentTypeConfig
  try {
    documentType = await adminFetch<DocumentTypeConfig>(`/admin/v1/document-types/${documentTypeId}`, {
      next: { revalidate: 60, tags: [`document-type-${documentTypeId}`] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  // A document fetched under the wrong country's URL is a 404, not a
  // silent cross-country render.
  if (documentType.countryId !== country.id) notFound()

  const vendorTypesResult = await adminFetch<VendorTypeListResult>(
    `/admin/v1/vendor-types?countryId=${country.id}&pageSize=200`,
    { next: { revalidate: 120, tags: [`vendor-types-${country.id}`] } },
  ).catch(() => null)
  const vendorTypes: VendorType[] = vendorTypesResult?.vendorTypes ?? []

  const canToggleStatus = documentType.status === "ACTIVE" || documentType.status === "INACTIVE"

  return (
    <div className="page-content animate-slide-up">

      <BackButton href={`/countries/${country.slug}/documents`}>Back to Documents</BackButton>

      <div className="admin-card flex items-center gap-4">
        <div className="icon-badge icon-badge-info h-14 w-14 shrink-0">
          <FileText className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-semibold text-foreground">{documentType.name}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {country.name} · <span className="font-mono">{documentType.code}</span> · {scopeLabel(documentType)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DocumentTypeStatusBadge status={documentType.status} />
          {canWrite && (
            <>
              <DocumentTypeFormDialog documentType={documentType} />
              {canToggleStatus && (
                <DocumentTypeStatusAction id={documentType.id} name={documentType.name} status={documentType.status} />
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="admin-card space-y-3 lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground">Details</h2>
          {documentType.description && (
            <p className="text-sm text-muted-foreground">{documentType.description}</p>
          )}
          {documentType.instructions && (
            <div className="rounded-xl border border-border/60 bg-muted/30 px-3.5 py-3">
              <p className="text-xs font-medium text-foreground">Shown to vendors</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{documentType.instructions}</p>
            </div>
          )}
          {documentType.sampleUrl && (
            <a
              href={documentType.sampleUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              View sample document
            </a>
          )}
        </div>

        <div className="admin-card space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Required</span>
            <span className="font-medium text-foreground">{documentType.isRequired ? "Yes" : "No"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Expires</span>
            <span className="font-medium text-foreground">{documentType.requiresExpiry ? "Yes" : "No"}</span>
          </div>
          {documentType.requiresExpiry && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Expiry warning</span>
              <span className="font-medium tabular-nums text-foreground">{documentType.expiryWarningDays} days</span>
            </div>
          )}
        </div>
      </div>

      <DocumentTypeVendorTypeManager
        documentTypeId={documentType.id}
        links={documentType.vendorTypeConfigs}
        allVendorTypes={vendorTypes}
        canWrite={canWrite}
      />
    </div>
  )
}
