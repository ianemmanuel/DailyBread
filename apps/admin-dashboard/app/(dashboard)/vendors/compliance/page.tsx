import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ShieldAlert, AlertTriangle, Clock, Users, Settings2, ArrowUpRight, FileX2, ShieldCheck, FileDown, ArrowRight, Wallet } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { getFilterableCountries } from "@/lib/countries/filterable-countries"
import { TableFilterBar, type FilterSelectOption } from "@/components/shared/TableFilterBar"
import { TablePagination } from "@/components/shared/TablePagination"
import { EmptyState } from "@/components/shared/EmptyState"
import { QueueDot } from "@/components/shared/QueueDot"
import { getInitials } from "@/lib/initials"
import { AdminPermissions } from "@repo/types/admin-app"
import type { ComplianceGroupsResult, ComplianceSeverity } from "@/types"
import type { DocumentTypeListResult } from "@/types/document-type.types"

export const metadata: Metadata = { title: "Vendor Compliance" }
export const revalidate = 60

const PAGE_SIZE = 20

interface PageProps {
  searchParams: Promise<{
    page?: string; search?: string; country?: string; docType?: string; status?: string; queue?: string
  }>
}

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "",              label: "All Issues" },
  { value: "MISSING",       label: "Missing" },
  { value: "EXPIRED",       label: "Expired" },
  { value: "EXPIRING_SOON", label: "Expiring Soon" },
  { value: "WAIVED",        label: "Waived" },
]

// Same three-pill "what should I be working on" concept as the vendor
// applications queue, applied to compliance cases.
const QUEUE_OPTIONS: { value: string; label: string }[] = [
  { value: "",           label: "All" },
  { value: "mine",       label: "My Cases" },
  { value: "unclaimed",  label: "Unclaimed" },
  { value: "escalated",  label: "Escalated" },
]

const SEVERITY_LABEL: Record<ComplianceSeverity, string> = { CRITICAL: "Critical", MEDIUM: "Medium", LOW: "Low" }
const SEVERITY_CLASS: Record<ComplianceSeverity, string> = {
  CRITICAL: "badge-danger", MEDIUM: "badge-warning", LOW: "badge-neutral",
}

/*
 * Vendor-grouped, not issue-flat — see CLAUDE.md's compliance-ownership
 * decision. One row per vendor (issue count + worst severity), driving to
 * /vendors/compliance/[vendorId] where a single admin can see and act on
 * everything affecting that vendor, including a "Claim all" convenience.
 * Per-issue severity/claim/escalate/waive stays exactly as granular as
 * before — this page is just a different shape of the same data.
 */
export default async function VendorCompliancePage({ searchParams }: PageProps) {
  const session = await getAdminSession()

  // Its own dedicated permission — viewing the compliance queue is gated
  // separately from the vendor directory in general (see CLAUDE.md).
  if (!session.permissions.includes(AdminPermissions.VENDORS_COMPLIANCE_READ)) redirect("/vendors")

  const canClaim     = session.permissions.includes(AdminPermissions.VENDORS_COMPLIANCE_CLAIM)
  const canEscalate  = session.permissions.includes(AdminPermissions.VENDORS_COMPLIANCE_ESCALATE)
  const showQueuePills = canClaim || canEscalate
  // Same country-scoped-only eligibility as claimComplianceCase's actual
  // enforcement (see ComplianceIssueActions) — a globally-scoped holder of
  // this permission still can't self-claim out of the pool, so the
  // Escalated tab's dot shouldn't light up for them either.
  const canReceiveEscalation = session.permissions.includes(AdminPermissions.VENDORS_COMPLIANCE_RECEIVE_ESCALATION) && !session.scope.isGlobal

  const params  = await searchParams
  const page    = params.page   ?? "1"
  const search  = params.search ?? ""
  const country = params.country ?? ""
  const docType = params.docType ?? ""
  const status  = params.status ?? ""
  const queue   = params.queue  ?? ""

  const { countries: allCountries, showFilter: showCountryFilter } = await getFilterableCountries(session.scope.isGlobal)

  // A country-scoped admin has an implicit country even without a picker —
  // needed below to resolve the document-type filter's catalog. A global
  // admin only gets one once they've actually picked a country from the
  // filter (document types are a per-country catalog, see note below).
  const ownCountry = !session.scope.isGlobal ? allCountries[0] : undefined
  const activeCountry = ownCountry ?? allCountries.find((c) => c.slug === country)

  // Document types are inherently country-scoped rows in the schema
  // (DocumentTypeConfig.countryId is required) — this picker only
  // populates once a single country is in view.
  const canReadDocTypes = session.permissions.includes(AdminPermissions.SETTINGS_DOCUMENTS_READ)
  const docTypesResult = canReadDocTypes && activeCountry
    ? await adminFetch<DocumentTypeListResult>(
        `/admin/v1/document-types?countryId=${activeCountry.id}&status=ACTIVE&scope=VENDOR&pageSize=200`,
        { next: { revalidate: 300, tags: [`document-types-${activeCountry.id}`] } },
      ).catch(() => null)
    : null
  const docTypeOptions: FilterSelectOption[] = (docTypesResult?.documentTypes ?? []).map((d) => ({
    value: d.id, label: d.name,
  }))

  const qsParams: Record<string, string> = { page, pageSize: String(PAGE_SIZE) }
  if (search) qsParams.search = search
  if (country) qsParams.countrySlug = country
  if (docType) qsParams.documentTypeId = docType
  if (status) qsParams.status = status
  if (queue) qsParams.queue = queue
  const qs = new URLSearchParams(qsParams)

  // Base filters (country/docType), without status/queue — reused for the
  // queue-pill notification-dot counts below so they narrow the same way
  // the pills themselves do, minus the queue being counted itself.
  const baseQsParams: Record<string, string> = {}
  if (country) baseQsParams.countrySlug = country
  if (docType) baseQsParams.documentTypeId = docType

  const [result, unclaimedCount, escalatedCount] = await Promise.all([
    adminFetch<ComplianceGroupsResult>(`/admin/v1/vendors/compliance/by-vendor?${qs}`, {
      next: { revalidate: 60, tags: ["vendor-compliance"] },
    }).catch(() => null),
    showQueuePills
      ? adminFetch<ComplianceGroupsResult>(`/admin/v1/vendors/compliance/by-vendor?${new URLSearchParams({ ...baseQsParams, queue: "unclaimed", pageSize: "1" })}`, {
          next: { revalidate: 60, tags: ["vendor-compliance"] },
        }).catch(() => ({ total: 0 }))
      : Promise.resolve({ total: 0 }),
    // Narrower than the tab's own "escalated" filter — only cases still
    // sitting unclaimed in the open pool, i.e. actually pickable by this
    // viewer, and only fetched at all when they're eligible to pick one
    // up (see canReceiveEscalation above).
    canReceiveEscalation
      ? adminFetch<ComplianceGroupsResult>(`/admin/v1/vendors/compliance/by-vendor?${new URLSearchParams({ ...baseQsParams, queue: "escalated_unclaimed", pageSize: "1" })}`, {
          next: { revalidate: 60, tags: ["vendor-compliance"] },
        }).catch(() => ({ total: 0 }))
      : Promise.resolve({ total: 0 }),
  ])

  const openIssues = (result?.missingCount ?? 0) + (result?.expiredCount ?? 0) + (result?.expiringCount ?? 0)
  const statCards = [
    { label: "Open Issues",     value: openIssues,                       icon: ShieldAlert,   badgeClass: "icon-badge-primary" },
    { label: "Missing",         value: result?.missingCount ?? 0,        icon: FileX2,        badgeClass: "icon-badge-danger" },
    { label: "Expired",         value: result?.expiredCount ?? 0,        icon: AlertTriangle, badgeClass: "icon-badge-danger" },
    { label: "Expiring Soon",   value: result?.expiringCount ?? 0,       icon: Clock,         badgeClass: "icon-badge-warning" },
    { label: "Waived",          value: result?.waivedCount ?? 0,         icon: ShieldCheck,   badgeClass: "icon-badge-success" },
    { label: "Vendors Affected", value: result?.affectedVendorCount ?? 0, icon: Users,        badgeClass: "icon-badge-info" },
  ]

  return (
    <div className="page-content animate-slide-up">
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/vendors" className="hover:text-foreground transition-colors">Vendors</Link>
          <span>/</span>
          <span className="text-foreground">Compliance</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="icon-badge icon-badge-primary h-10 w-10">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Compliance</h1>
              <p className="text-sm text-muted-foreground">
                One row per vendor — missing, expired, or soon-to-expire documents, plus payout-account issues, across your scope.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Roadmap VM-P2-01 (CLAUDE.md) — still issue-level (unpaginated), same filters as this page. */}
            <a
              href={`/api/vendors/compliance/export?${qs}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-[var(--shadow-xs)] transition-colors hover:border-primary/40 hover:text-primary"
            >
              <FileDown className="h-3.5 w-3.5" />
              Export CSV
            </a>
            {activeCountry && canReadDocTypes && (
              <Link
                href={`/countries/${activeCountry.slug}/documents`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-[var(--shadow-xs)] transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Manage document types for {activeCountry.name}
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Status overview */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statCards.map(({ label, value, icon: Icon, badgeClass }) => (
          <div key={label} className="stat-card">
            <div className={`icon-badge h-12 w-12 ${badgeClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="stat-card-value">{value}</p>
              <p className="stat-card-label">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Operational queue — who's working on what, distinct from the
          missing/expired/expiring breakdown below. Only shown to admins
          who can actually own a case. */}
      {showQueuePills && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 p-1 w-fit">
          {QUEUE_OPTIONS.map(({ value, label }) => {
            const qp = new URLSearchParams()
            if (status)  qp.set("status", status)
            if (country) qp.set("country", country)
            if (docType) qp.set("docType", docType)
            if (value)   qp.set("queue", value)
            const href = qp.toString() ? `/vendors/compliance?${qp}` : "/vendors/compliance"
            const active = queue === value
            return (
              <Link
                key={value || "all"}
                href={href}
                className={[
                  "inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                  active ? "bg-card text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {label}
                {value === "unclaimed" && <QueueDot show={(unclaimedCount as { total: number }).total > 0} />}
                {value === "escalated" && <QueueDot show={(escalatedCount  as { total: number }).total > 0} />}
              </Link>
            )
          })}
        </div>
      )}

      {/* Status tabs */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 p-1 w-fit">
        {STATUS_TABS.map(({ value, label }) => {
          const qp = new URLSearchParams()
          if (search)  qp.set("search", search)
          if (country) qp.set("country", country)
          if (docType) qp.set("docType", docType)
          if (queue)   qp.set("queue", queue)
          if (value)   qp.set("status", value)
          const href = qp.toString() ? `/vendors/compliance?${qp}` : "/vendors/compliance"
          const active = status === value
          return (
            <Link
              key={value || "all"}
              href={href}
              className={[
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                active ? "bg-card text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {label}
            </Link>
          )
        })}
      </div>

      {/* Filters */}
      <TableFilterBar
        searchPlaceholder="Search business name…"
        defaultSearch={search}
        {...(showCountryFilter ? { countryOptions: allCountries.map((c) => ({ value: c.slug, label: c.name })), defaultCountry: country } : {})}
        {...(docTypeOptions.length > 0 ? { docTypeOptions, defaultDocType: docType } : {})}
      />
      {canReadDocTypes && !activeCountry && (
        <p className="-mt-4 text-xs text-muted-foreground">
          Select a country above to filter by a specific document type — document types are defined per country.
        </p>
      )}

      {/* Table — one row per vendor */}
      {!result || result.groups.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No compliance issues"
          description="Nothing missing, expired, or expiring in your scope right now — adjust filters if you expected results."
        />
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs uppercase tracking-wide">Vendor</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Issues</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Worst Severity</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Status</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.groups.map((group) => (
                  <TableRow key={group.vendor.id} className="hover:bg-muted/10">
                    <TableCell>
                      <Link href={`/vendors/compliance/${group.vendor.id}`} className="group flex items-center gap-3">
                        <div className="avatar-circle h-8 w-8 text-xs">
                          {getInitials(group.vendor.legalBusinessName)}
                        </div>
                        <span className="min-w-0 truncate font-medium text-foreground transition-colors group-hover:text-primary">
                          {group.vendor.legalBusinessName}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                        {group.issueCount} issue{group.issueCount === 1 ? "" : "s"}
                        {group.hasMissingPayoutAccount && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[10px] font-medium text-warning">
                            <Wallet className="h-3 w-3" /> Payout
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className={SEVERITY_CLASS[group.worstSeverity]}>{SEVERITY_LABEL[group.worstSeverity]}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {group.hasEscalated && <span className="badge-danger">Escalated</span>}
                        {!group.hasEscalated && group.hasUnclaimed && <span className="badge-warning">Unclaimed</span>}
                        {!group.hasEscalated && !group.hasUnclaimed && <span className="text-muted-foreground">In hand</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm" className="rounded-full gap-1.5">
                        <Link href={`/vendors/compliance/${group.vendor.id}`}>
                          View <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <TablePagination
            total={result.total}
            page={page}
            totalPages={result.totalPages}
            basePath="/vendors/compliance"
            params={{
              ...(search  ? { search }  : {}),
              ...(country ? { country } : {}),
              ...(docType ? { docType } : {}),
              ...(status  ? { status }  : {}),
              ...(queue   ? { queue }   : {}),
            }}
            itemLabel="vendors"
          />
        </div>
      )}
    </div>
  )
}
