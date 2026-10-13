import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { FileText, Clock, AlertTriangle, CheckCircle, XCircle, FileDown } from "lucide-react"
import { adminFetch }  from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { VendorApplicationsTable } from "@/components/vendors/VendorApplicationsTable"
import { TableFilterBar, type FilterStatusOption, type FilterSortOption, type FilterSelectOption } from "@/components/shared/TableFilterBar"
import { QueueDot } from "@/components/shared/QueueDot"
import { HowApplicationReviewDialog } from "@/components/vendors/HowApplicationReviewDialog"
import { AdminPermissions } from "@repo/types/admin-app"
import type { ApplicationListResult } from "@/types"
import type { CountryListLite, CountryLite } from "@/types/vendor-type.types"

export const metadata: Metadata = { title: "Vendor Applications" }
export const revalidate = 60
 
interface PageProps {
  searchParams: Promise<{
    page?     : string
    search?   : string
    status?   : string
    country?  : string
    queue?    : string
    sort?     : string
    dir?      : string
  }>
}

// Operational queues — thin wrappers around fields the review workflow
// already tracks (assignedReviewerId/escalatedByAdminId). Always applied
// on top of the admin's existing country/city scope filter, never instead
// of it — see listApplications' queueFilter.
const QUEUE_OPTIONS: { value: string; label: string }[] = [
  { value: "",           label: "All" },
  { value: "mine",       label: "My Applications" },
  { value: "unassigned", label: "Unassigned" },
  { value: "escalated",  label: "Escalated" },
]

const STATUS_CARDS = [
  { status: "SUBMITTED",      label: "Submitted",      icon: FileText,      badgeClass: "icon-badge-info" },
  { status: "UNDER_REVIEW",   label: "Under Review",   icon: Clock,         badgeClass: "icon-badge-warning" },
  { status: "NEEDS_REVISION", label: "Needs Revision", icon: AlertTriangle, badgeClass: "icon-badge-warning" },
  { status: "APPROVED",       label: "Approved",       icon: CheckCircle,   badgeClass: "icon-badge-success" },
  { status: "REJECTED",       label: "Rejected",       icon: XCircle,       badgeClass: "icon-badge-danger" },
]

// No DRAFT option here — a draft is the vendor's own unsubmitted
// work-in-progress and isn't open to admins at all (the backend excludes
// it from the default list and 404s a direct-id lookup too).
const STATUS_OPTIONS: FilterStatusOption[] = [
  { value: "all",            label: "All statuses",   dot: "bg-muted-foreground/40" },
  { value: "SUBMITTED",      label: "Submitted",      dot: "bg-info" },
  { value: "UNDER_REVIEW",   label: "Under Review",   dot: "bg-warning" },
  { value: "NEEDS_REVISION", label: "Needs Revision", dot: "bg-warning" },
  { value: "APPROVED",       label: "Approved",       dot: "bg-success" },
  { value: "REJECTED",       label: "Rejected",       dot: "bg-destructive" },
]

const SORT_OPTIONS: FilterSortOption[] = [
  // Default — needs-action statuses (Submitted/Needs Revision) first, then
  // Under Review, terminal statuses last; oldest-first within each bucket
  // so nothing starves. Computed server-side (listApplications' sort=priority).
  { value: "priority",          label: "Priority (needs action first)", icon: "updown" },
  { value: "submittedAt",       label: "Date submitted", icon: "updown" },
  { value: "createdAt",         label: "Date created",   icon: "updown" },
  { value: "legalBusinessName", label: "Business name",  icon: "az" },
]

export default async function VendorApplicationsPage({ searchParams }: PageProps) {
  const session = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.VENDORS_APPLICATIONS_READ)) {
    redirect("/vendors")
  }

  const params  = await searchParams
  const page    = params.page    ?? "1"
  const search  = params.search  ?? ""
  const status  = params.status  ?? ""
  const country = params.country ?? ""
  const queue   = params.queue   ?? ""
  const sort    = params.sort    ?? "priority"
  const dir     = params.dir     ?? "desc"
  // REVIEW is the base capability to act on an application at all — the
  // per-row "Review" link should be visible to anyone who can open and
  // act on an application, not just admins who specifically hold APPROVE
  // (a reviewer with only reject/needs-revision access still needs it).
  const canReview = session.permissions.includes(AdminPermissions.VENDORS_APPLICATIONS_REVIEW)

  // Country picker options — /admin/v1/countries is itself scope-aware, so
  // a country-scoped admin already only gets their own country/countries
  // back here (see admin.country.service.ts#getCountriesByStatus). A
  // country filter must never widen access beyond that response.
  const countriesResult = await adminFetch<CountryListLite>(`/admin/v1/countries?status=ACTIVE&pageSize=500`, {
    next: { revalidate: 300, tags: ["active-countries"] },
  }).catch(() => null)
  const countryOptions: FilterSelectOption[] = (countriesResult?.countries ?? []).map((c: CountryLite) => ({
    value: c.slug, label: c.name,
  }))
  // A single-country actor has nothing to pick between — the filter would
  // just restate what their scope already guarantees, so it's omitted
  // rather than shown-and-locked.
  const showCountryFilter = countryOptions.length > 1

  const qs = new URLSearchParams({
    page, pageSize: "20",
    ...(search  ? { search }        : {}),
    ...(status  ? { status }        : {}),
    ...(country ? { countrySlug: country } : {}),
    ...(queue   ? { queue }         : {}),
    sort,
    dir,
  })

  // Fetch count per status for overview cards + main list in parallel —
  // status-card counts respect the country/queue narrowing so they stay
  // consistent with what the table below actually shows.
  const countryQs = country ? `&countrySlug=${country}` : ""
  const queueQs   = queue   ? `&queue=${queue}`         : ""
  const [result, unassignedCount, escalatedCount, ...statusCounts] = await Promise.all([
    adminFetch<ApplicationListResult>(`/admin/v1/vendors/applications?${qs}`, {
      next: { revalidate: 60, tags: ["vendor-applications"] },
    }).catch(() => null),
    // Backs the queue-pill notification dots below — only fetched when
    // the pills themselves are shown (canReview).
    canReview
      ? adminFetch<ApplicationListResult>(`/admin/v1/vendors/applications?queue=unassigned&pageSize=1${countryQs}`, {
          next: { revalidate: 60, tags: ["vendor-applications"] },
        }).catch(() => ({ total: 0 }))
      : Promise.resolve({ total: 0 }),
    canReview
      ? adminFetch<ApplicationListResult>(`/admin/v1/vendors/applications?queue=escalated&pageSize=1${countryQs}`, {
          next: { revalidate: 60, tags: ["vendor-applications"] },
        }).catch(() => ({ total: 0 }))
      : Promise.resolve({ total: 0 }),
    ...STATUS_CARDS.map(({ status: s }) =>
      adminFetch<ApplicationListResult>(`/admin/v1/vendors/applications?status=${s}&pageSize=1${countryQs}${queueQs}`, {
        next: { revalidate: 60, tags: ["vendor-applications"] },
      }).catch(() => ({ total: 0 }))
    ),
  ])

  return (
    <div className="page-content animate-slide-up">

      {/* Breadcrumb */}
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/vendors" className="hover:text-foreground transition-colors">Vendors</Link>
          <span>/</span>
          <span className="text-foreground">Applications</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="icon-badge icon-badge-primary h-10 w-10">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                Applications
              </h1>
              <p className="text-sm text-muted-foreground">
                Review and action vendor applications.
              </p>
            </div>
          </div>
          <a
            href={`/api/vendors/applications/export?${qs}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-[var(--shadow-xs)] transition-colors hover:border-primary/40 hover:text-primary"
          >
            <FileDown className="h-3.5 w-3.5" />
            Export CSV
          </a>
        </div>
      </div>

      {/* Operational queues — "what should I be working on", distinct from
          the status breakdown below. Only meaningful for admins who can
          actually own applications. */}
      {canReview && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 p-1 w-fit">
          {QUEUE_OPTIONS.map(({ value, label }) => {
            const qp = new URLSearchParams()
            if (status)  qp.set("status", status)
            if (country) qp.set("country", country)
            if (value)   qp.set("queue", value)
            const href = qp.toString() ? `/vendors/applications?${qp}` : "/vendors/applications"
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
                {value === "unassigned" && <QueueDot show={(unassignedCount as { total: number }).total > 0} />}
                {value === "escalated"  && <QueueDot show={(escalatedCount  as { total: number }).total > 0} />}
              </Link>
            )
          })}
        </div>
      )}

      {/* Status overview cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {STATUS_CARDS.map(({ status: s, label, icon: Icon, badgeClass }, i) => (
          <Link
            key={s}
            href={`/vendors/applications?status=${s}`}
            className={[
              "stat-card",
              status === s ? "border-primary/50" : "",
            ].join(" ")}
          >
            <div className={`icon-badge h-12 w-12 ${badgeClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="stat-card-value">
                {(statusCounts[i] as any)?.total ?? 0}
              </p>
              <p className="stat-card-label">{label}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Filters */}
      <TableFilterBar
        searchPlaceholder="Search business or email…"
        defaultSearch={search}
        statusOptions={STATUS_OPTIONS}
        defaultStatus={status}
        sortOptions={SORT_OPTIONS}
        defaultSort={sort}
        defaultDir={dir}
        {...(showCountryFilter ? { countryOptions, defaultCountry: country } : {})}
      />

      {/* Table */}
      <VendorApplicationsTable
        result={result}
        page={page}
        search={search}
        status={status}
        sort={sort}
        dir={dir}
        canReview={canReview}
        country={country}
        queue={queue}
      />

      <div className="flex justify-center">
        <HowApplicationReviewDialog />
      </div>
    </div>
  )
}