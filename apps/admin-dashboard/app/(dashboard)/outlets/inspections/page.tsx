import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ClipboardCheck, CalendarClock, Clock, XCircle } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@repo/ui/components/table"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { getFilterableCountries } from "@/lib/countries/filterable-countries"
import { TableFilterBar } from "@/components/shared/TableFilterBar"
import { TablePagination } from "@/components/shared/TablePagination"
import { EmptyState } from "@/components/shared/EmptyState"
import { AdminPermissions } from "@repo/types/admin-app"
import type { OutletInspectionListResult, OutletInspectionStatus } from "@/types"

export const metadata: Metadata = { title: "Outlet Inspections" }
export const revalidate = 60

const PAGE_SIZE = 20

interface PageProps {
  searchParams: Promise<{
    page?: string; search?: string; country?: string; status?: string
    vendor?: string; vendorName?: string
  }>
}

/* "All" carries an explicit `status=all` - see the note on the outlets page. */
const STATUS_TABS: { value: string; label: string }[] = [
  { value: "SCHEDULED",   label: "Scheduled" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "all",         label: "All" },
  { value: "PASSED",      label: "Passed" },
  { value: "FAILED",      label: "Failed" },
  { value: "WAIVED",      label: "Waived" },
  { value: "CANCELLED",   label: "Cancelled" },
]

const STATUS_BADGE: Record<OutletInspectionStatus, string> = {
  SCHEDULED: "badge-warning", IN_PROGRESS: "badge-warning", PASSED: "badge-success",
  FAILED: "badge-danger", WAIVED: "badge-neutral", CANCELLED: "badge-neutral",
}
const STATUS_LABEL: Record<OutletInspectionStatus, string> = {
  SCHEDULED: "Scheduled", IN_PROGRESS: "In progress", PASSED: "Passed",
  FAILED: "Failed", WAIVED: "Waived", CANCELLED: "Cancelled",
}

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString() : "—"
}

export default async function OutletInspectionsPage({ searchParams }: PageProps) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.VENDORS_OUTLETS_READ)) redirect("/vendors")

  const params  = await searchParams
  const page    = params.page ?? "1"
  const search  = params.search ?? ""
  const country = params.country ?? ""
  const statusTab = params.status ?? "SCHEDULED"
  const status    = statusTab === "all" ? "" : statusTab
  const vendor  = params.vendor ?? ""
  const vendorName = params.vendorName ?? ""

  const { countries: allCountries, showFilter: showCountryFilter } = await getFilterableCountries(session.scope.isGlobal)

  const qsParams: Record<string, string> = { page, pageSize: String(PAGE_SIZE) }
  if (search)  qsParams.search  = search
  if (country) qsParams.country = country
  if (status)  qsParams.status  = status
  if (vendor)  qsParams.vendor  = vendor
  const qs = new URLSearchParams(qsParams)

  /** Every tab link carries the active filters plus an explicit status. */
  const tabHref = (value: string) => {
    const qp = new URLSearchParams()
    if (search)  qp.set("search", search)
    if (country) qp.set("country", country)
    if (vendor)  { qp.set("vendor", vendor); if (vendorName) qp.set("vendorName", vendorName) }
    qp.set("status", value)
    return `/outlets/inspections?${qp}`
  }

  const result = await adminFetch<OutletInspectionListResult>(`/admin/v1/vendors/outlet-inspections?${qs}`, {
    next: { revalidate: 60, tags: ["outlet-inspections-admin"] },
  }).catch(() => null)

  /*
   * The counts come from the WHOLE scope, not the current tab — that is what
   * makes the empty state able to say "nothing scheduled, but 4 passed" rather
   * than just "nothing here", which is how a working queue reads as broken.
   */
  const counts = result?.counts ?? { scheduled: 0, inProgress: 0, failed: 0 }
  const anyInScope = counts.scheduled + counts.inProgress + counts.failed > 0
  const statCards = [
    { label: "Scheduled",   value: counts.scheduled,  icon: CalendarClock, badgeClass: "icon-badge-warning" },
    { label: "In progress", value: counts.inProgress, icon: Clock,         badgeClass: "icon-badge-warning" },
    { label: "Failed",      value: counts.failed,     icon: XCircle,       badgeClass: "icon-badge-danger" },
  ]

  return (
    <div className="page-content animate-slide-up">
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/outlets" className="hover:text-foreground transition-colors">Outlets</Link>
          <span>/</span>
          <span className="text-foreground">Inspections</span>
        </nav>
        <div className="mt-2 flex items-center gap-3">
          <div className="icon-badge icon-badge-primary h-10 w-10">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Outlet inspections</h1>
            <p className="text-sm text-muted-foreground">
              Physical premises inspections — the meal-plan-eligibility gate. Schedule, conduct, and record outcomes from each outlet&apos;s detail page.
            </p>
          </div>
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

      <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 p-1 w-fit">
        {STATUS_TABS.map(({ value, label }) => {
          const active = statusTab === value
          return (
            <Link
              key={value}
              href={tabHref(value)}
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

      {/* Grouped to one vendor — linked from the vendor account page. */}
      {vendor && (
        <div className="admin-card flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
          <span className="text-muted-foreground">
            Showing inspections for{" "}
            <span className="font-medium text-foreground">{vendorName || "one vendor"}</span> only
          </span>
          <Link href="/outlets/inspections" className="view-all-link text-xs">Clear filter</Link>
        </div>
      )}

      <TableFilterBar
        searchPlaceholder="Search outlet or business name…"
        defaultSearch={search}
        {...(showCountryFilter ? { countryOptions: allCountries.map((c) => ({ value: c.slug, label: c.name })), defaultCountry: country } : {})}
      />

      {!result ? (
        <div className="admin-card text-sm text-destructive">
          Couldn&apos;t load inspections. Reload the page, or check that your admin account still has access to
          this section.
        </div>
      ) : result.inspections.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={
            !anyInScope
              ? "No inspections yet"
              : statusTab === "all"
                ? "No inspections match these filters"
                : `No ${(STATUS_LABEL[statusTab as OutletInspectionStatus] ?? "matching").toLowerCase()} inspections`
          }
          description={
            !anyInScope
              ? "Inspections are scheduled from an outlet's own page, under Premises inspection. Nothing has been scheduled yet."
              : statusTab === "all"
                ? "Nothing matches these filters. Clear the search or country filter to widen the view."
                : `Nothing in this tab. There are ${counts.scheduled} scheduled, ${counts.inProgress} in progress and ${counts.failed} failed elsewhere — switch tabs above, or view all of them.`
          }
          {...(!anyInScope
            ? { actionLabel: "Browse outlets", actionHref: "/outlets" }
            : statusTab === "all"
              ? {}
              : { actionLabel: "View all inspections", actionHref: tabHref("all") })}
        />
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs uppercase tracking-wide">Outlet</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">City</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Scheduled</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.inspections.map((ins) => (
                  <TableRow key={ins.id} className="hover:bg-muted/10">
                    <TableCell className="font-medium text-foreground">
                      <Link href={`/outlets/${ins.outlet.id}`} className="hover:text-primary hover:underline">
                        {ins.outlet.name}
                      </Link>
                      <p className="text-xs font-normal text-muted-foreground">{ins.vendor.legalBusinessName}</p>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{ins.city?.name ?? "—"}</TableCell>
                    <TableCell>
                      <span className={STATUS_BADGE[ins.status]}>{STATUS_LABEL[ins.status]}</span>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{fmt(ins.scheduledFor)}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{fmt(ins.completedAt)}</TableCell>
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
          basePath="/outlets/inspections"
          params={{
            ...(search ? { search } : {}), ...(country ? { country } : {}),
            status: statusTab, ...(vendor ? { vendor } : {}),
            ...(vendorName ? { vendorName } : {}),
          }}
          itemLabel="inspections"
        />
      )}
    </div>
  )
}
