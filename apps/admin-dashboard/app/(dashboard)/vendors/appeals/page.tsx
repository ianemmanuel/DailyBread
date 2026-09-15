import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Scale, Clock, Gavel, CheckCircle2, FileDown } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { getFilterableCountries } from "@/lib/countries/filterable-countries"
import { TableFilterBar } from "@/components/shared/TableFilterBar"
import { TablePagination } from "@/components/shared/TablePagination"
import { EmptyState } from "@/components/shared/EmptyState"
import { QueueDot } from "@/components/shared/QueueDot"
import { VendorAppealActions } from "@/components/vendors/VendorAppealActions"
import { AdminPermissions } from "@repo/types/admin-app"
import type { VendorAppealListResult, AppealStatus, AppealSubjectType } from "@/types"

export const metadata: Metadata = { title: "Vendor Appeals" }
export const revalidate = 60

const PAGE_SIZE = 20

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string; country?: string; type?: string; status?: string; queue?: string }>
}

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "",             label: "All" },
  { value: "OPEN",         label: "Open" },
  { value: "UNDER_REVIEW", label: "Under Review" },
  { value: "ESCALATED",    label: "Escalated" },
  { value: "UPHELD",       label: "Upheld" },
  { value: "OVERTURNED",   label: "Overturned" },
]

// Same three-pill "what should I be working on" concept as compliance's
// queue filter.
const QUEUE_OPTIONS: { value: string; label: string }[] = [
  { value: "",           label: "All" },
  { value: "mine",       label: "My Appeals" },
  { value: "unclaimed",  label: "Unclaimed" },
  { value: "escalated",  label: "Escalated" },
]

const SUBJECT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "APPLICATION_REJECTION", label: "Application Rejection" },
  { value: "ACCOUNT_SUSPENSION",    label: "Account Suspension" },
  { value: "ACCOUNT_BAN",           label: "Account Ban" },
]

const STATUS_BADGE: Record<AppealStatus, string> = {
  OPEN        : "badge-neutral",
  UNDER_REVIEW: "badge-warning",
  ESCALATED   : "badge-danger",
  UPHELD      : "badge-danger",
  OVERTURNED  : "badge-success",
}

const STATUS_LABEL: Record<AppealStatus, string> = {
  OPEN: "Open", UNDER_REVIEW: "Under Review", ESCALATED: "Escalated", UPHELD: "Upheld", OVERTURNED: "Overturned",
}

const SUBJECT_TYPE_LABEL: Record<AppealSubjectType, string> = {
  APPLICATION_REJECTION: "Application Rejection",
  ACCOUNT_SUSPENSION   : "Account Suspension",
  ACCOUNT_BAN          : "Account Ban",
}

export default async function VendorAppealsPage({ searchParams }: PageProps) {
  const session = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.VENDORS_APPEALS_READ)) redirect("/vendors")
  const canManage    = session.permissions.includes(AdminPermissions.VENDORS_APPEALS_MANAGE)
  const canClaim     = session.permissions.includes(AdminPermissions.VENDORS_APPEALS_CLAIM)
  const canEscalate  = session.permissions.includes(AdminPermissions.VENDORS_APPEALS_ESCALATE)
  const canReassign  = session.permissions.includes(AdminPermissions.VENDORS_APPEALS_REASSIGN)
  const showQueuePills = canClaim || canEscalate
  // Same country-scoped-only eligibility as claimAppeal's actual
  // enforcement — a globally-scoped holder still can't self-claim out of
  // the pool, so the Escalated pill's dot shouldn't light up for them.
  const canReceiveEscalation = session.permissions.includes(AdminPermissions.VENDORS_APPEALS_RECEIVE_ESCALATION) && !session.scope.isGlobal

  const params  = await searchParams
  const page    = params.page   ?? "1"
  const search  = params.search ?? ""
  const country = params.country ?? ""
  const type    = params.type   ?? ""
  const status  = params.status ?? ""
  const queue   = params.queue  ?? ""

  const { countries: allCountries, showFilter: showCountryFilter } = await getFilterableCountries(session.scope.isGlobal)

  const qsParams: Record<string, string> = { page, pageSize: String(PAGE_SIZE) }
  if (search)  qsParams.search      = search
  if (country) qsParams.countrySlug = country
  if (type)    qsParams.subjectType = type
  if (status)  qsParams.status      = status
  if (queue)   qsParams.queue       = queue
  const qs = new URLSearchParams(qsParams)

  // Stat cards are server-computed counts (same Promise.all(pageSize=1)
  // pattern as Applications/Accounts/Outlets), not derived from the
  // current page's slice — an appeal on page 2 was previously invisible
  // to these cards entirely, since result.appeals only ever holds one
  // page's worth of rows.
  const countryFilterQs = country ? `&countrySlug=${country}` : ""
  const typeFilterQs    = type    ? `&subjectType=${type}`    : ""
  const scopedQs        = `${countryFilterQs}${typeFilterQs}`

  const [result, openCountResult, reviewCountResult, upheldCountResult, overturnedCountResult, unclaimedCount, escalatedCount] = await Promise.all([
    adminFetch<VendorAppealListResult>(`/admin/v1/vendors/appeals?${qs}`, {
      next: { revalidate: 60, tags: ["vendor-appeals"] },
    }).catch(() => null),
    adminFetch<VendorAppealListResult>(`/admin/v1/vendors/appeals?status=OPEN&pageSize=1${scopedQs}`, {
      next: { revalidate: 60, tags: ["vendor-appeals"] },
    }).catch(() => ({ total: 0 })),
    adminFetch<VendorAppealListResult>(`/admin/v1/vendors/appeals?status=UNDER_REVIEW&pageSize=1${scopedQs}`, {
      next: { revalidate: 60, tags: ["vendor-appeals"] },
    }).catch(() => ({ total: 0 })),
    adminFetch<VendorAppealListResult>(`/admin/v1/vendors/appeals?status=UPHELD&pageSize=1${scopedQs}`, {
      next: { revalidate: 60, tags: ["vendor-appeals"] },
    }).catch(() => ({ total: 0 })),
    adminFetch<VendorAppealListResult>(`/admin/v1/vendors/appeals?status=OVERTURNED&pageSize=1${scopedQs}`, {
      next: { revalidate: 60, tags: ["vendor-appeals"] },
    }).catch(() => ({ total: 0 })),
    showQueuePills
      ? adminFetch<VendorAppealListResult>(`/admin/v1/vendors/appeals?queue=unclaimed&pageSize=1${scopedQs}`, {
          next: { revalidate: 60, tags: ["vendor-appeals"] },
        }).catch(() => ({ total: 0 }))
      : Promise.resolve({ total: 0 }),
    // Narrower than the tab's own "escalated" filter — only appeals still
    // sitting unclaimed in the open pool, i.e. actually pickable by this
    // viewer.
    canReceiveEscalation
      ? adminFetch<VendorAppealListResult>(`/admin/v1/vendors/appeals?queue=escalated_unclaimed&pageSize=1${scopedQs}`, {
          next: { revalidate: 60, tags: ["vendor-appeals"] },
        }).catch(() => ({ total: 0 }))
      : Promise.resolve({ total: 0 }),
  ])

  const openCount     = (openCountResult as { total: number }).total
  const reviewCount   = (reviewCountResult as { total: number }).total
  const resolvedCount = (upheldCountResult as { total: number }).total + (overturnedCountResult as { total: number }).total

  const statCards = [
    { label: "Open",         value: openCount,     icon: Scale,        badgeClass: "icon-badge-primary" },
    { label: "Under Review", value: reviewCount,   icon: Clock,        badgeClass: "icon-badge-warning" },
    { label: "Resolved",     value: resolvedCount, icon: CheckCircle2, badgeClass: "icon-badge-success" },
  ]

  return (
    <div className="page-content animate-slide-up">
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/vendors" className="hover:text-foreground transition-colors">Vendors</Link>
          <span>/</span>
          <span className="text-foreground">Appeals</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="icon-badge icon-badge-primary h-10 w-10">
              <Gavel className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Appeals</h1>
              <p className="text-sm text-muted-foreground">
                Formal appeals against a rejected application, account suspension, or ban — logged on behalf of a vendor who raised it through another channel.
              </p>
            </div>
          </div>
          <a
            href={`/api/vendors/appeals/export?${qs}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-[var(--shadow-xs)] transition-colors hover:border-primary/40 hover:text-primary"
          >
            <FileDown className="h-3.5 w-3.5" />
            Export CSV
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
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
          status breakdown below. Only shown to admins who can actually
          own an appeal. */}
      {showQueuePills && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 p-1 w-fit">
          {QUEUE_OPTIONS.map(({ value, label }) => {
            const qp = new URLSearchParams()
            if (status)  qp.set("status", status)
            if (country) qp.set("country", country)
            if (type)    qp.set("type", type)
            if (value)   qp.set("queue", value)
            const href = qp.toString() ? `/vendors/appeals?${qp}` : "/vendors/appeals"
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

      <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 p-1 w-fit">
        {STATUS_TABS.map(({ value, label }) => {
          const qp = new URLSearchParams()
          if (search)  qp.set("search", search)
          if (country) qp.set("country", country)
          if (type)    qp.set("type", type)
          if (queue)   qp.set("queue", queue)
          if (value)   qp.set("status", value)
          const href = qp.toString() ? `/vendors/appeals?${qp}` : "/vendors/appeals"
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

      <TableFilterBar
        searchPlaceholder="Search business name…"
        defaultSearch={search}
        {...(showCountryFilter ? { countryOptions: allCountries.map((c) => ({ value: c.slug, label: c.name })), defaultCountry: country } : {})}
        categoryLabel="Subject Type"
        categoryOptions={SUBJECT_TYPE_OPTIONS}
        defaultCategory={type}
      />

      {!result || result.appeals.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="No appeals logged"
          description="Nothing to show for these filters. Log an appeal from a rejected application or a suspended/banned vendor's detail page."
        />
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs uppercase tracking-wide">Vendor</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Type</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Status</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide lg:table-cell">Reason</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Assigned</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Logged</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.appeals.map((appeal) => (
                  <TableRow key={appeal.id} className="hover:bg-muted/10">
                    <TableCell className="font-medium text-foreground">
                      {appeal.subjectType === "APPLICATION_REJECTION" ? (
                        <Link href={`/vendors/applications/${appeal.applicationId}`} className="hover:text-primary hover:underline">
                          {appeal.subjectName}
                        </Link>
                      ) : (
                        <Link href={`/vendors/accounts/${appeal.vendorId}`} className="hover:text-primary hover:underline">
                          {appeal.subjectName}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{SUBJECT_TYPE_LABEL[appeal.subjectType]}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className={STATUS_BADGE[appeal.status]}>{STATUS_LABEL[appeal.status]}</span>
                    </TableCell>
                    <TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground lg:table-cell" title={appeal.reason}>
                      {appeal.reason}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {appeal.assignedReviewerName ?? "Unassigned"}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {new Date(appeal.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <VendorAppealActions appeal={appeal} canManage={canManage} canClaim={canClaim} canEscalate={canEscalate} canReassign={canReassign} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {result && (
        <TablePagination
          total={result.total}
          page={result.page}
          totalPages={result.totalPages}
          basePath="/vendors/appeals"
          params={{ ...(search ? { search } : {}), ...(country ? { country } : {}), ...(type ? { type } : {}), ...(status ? { status } : {}), ...(queue ? { queue } : {}) }}
          itemLabel="appeals"
        />
      )}
    </div>
  )
}
