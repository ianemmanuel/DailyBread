import Link from "next/link"
import { ExternalLink, Globe2, Building2, Tag, Info } from "lucide-react"
import type { DocumentTypeConfig } from "@/types/document-type.types"

interface Props {
  documentType: DocumentTypeConfig
  countryName : string
  countrySlug : string
  cityName    : string | null
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm text-foreground">{children}</div>
    </div>
  )
}

/** Read-only detail view — editing already happens via DocumentTypeFormDialog on the list page. */
export function DocumentTypeDetailCard({ documentType: dt, countryName, countrySlug, cityName }: Props) {
  return (
    <div className="space-y-4">
      <div className="admin-card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Scope">
            <span className="badge-info">
              <Tag className="h-3 w-3" />
              {dt.scope === "VENDOR" ? "Vendor" : "Outlet"}
            </span>
          </Field>
          <Field label="Requirement">
            <span className={dt.isRequired ? "badge-info" : "badge-neutral"}>
              {dt.isRequired ? "Required" : "Optional"}
            </span>
          </Field>
          <Field label="Country">
            <Link href={`/countries/${countrySlug}`} className="inline-flex items-center gap-1.5 hover:text-primary">
              <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
              {countryName}
            </Link>
          </Field>
          <Field label="City">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              {cityName ?? "All cities"}
            </span>
          </Field>
          <Field label="Expiry">
            {dt.requiresExpiry
              ? `Requires expiry — warns ${dt.expiryWarningDays} day${dt.expiryWarningDays === 1 ? "" : "s"} before`
              : "No expiry tracking"}
          </Field>
          <Field label="Compliance severity">
            {dt.complianceSeverity.charAt(0) + dt.complianceSeverity.slice(1).toLowerCase()}
            {dt.gracePeriodDays > 0 && ` · ${dt.gracePeriodDays}-day grace period after expiry`}
          </Field>
          {dt.enforcedFrom && (
            <Field label="Enforced from">
              {new Date(dt.enforcedFrom) > new Date()
                ? `${new Date(dt.enforcedFrom).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} — not yet enforced for existing vendors`
                : new Date(dt.enforcedFrom).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
            </Field>
          )}
          <Field label="Created">
            {new Date(dt.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
          </Field>
        </div>

        {dt.description && (
          <Field label="Description">
            <p className="whitespace-pre-wrap text-muted-foreground">{dt.description}</p>
          </Field>
        )}

        {dt.instructions && (
          <Field label="Instructions">
            <p className="flex items-start gap-1.5 whitespace-pre-wrap text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {dt.instructions}
            </p>
          </Field>
        )}

        {dt.sampleUrl && (
          <Field label="Sample">
            <a
              href={dt.sampleUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-primary hover:underline"
            >
              View sample <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Field>
        )}
      </div>

      <div className="admin-card">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Required By Vendor Types</h2>
        {dt.vendorTypeConfigs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not yet linked to any vendor type.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {dt.vendorTypeConfigs.map((link) => (
              <span key={link.id} className={link.isRequired ? "badge-info" : "badge-neutral"}>
                {link.vendorType.name} · {link.isRequired ? "Required" : "Optional"}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
