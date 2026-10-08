import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { UtensilsCrossed, Flag, Undo2, ShieldAlert, Ban, FileDown, ChevronRight, ImageOff } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { getFilterableCountries } from "@/lib/countries/filterable-countries"
import { TableFilterBar } from "@/components/shared/TableFilterBar"
import { TablePagination } from "@/components/shared/TablePagination"
import { EmptyState } from "@/components/shared/EmptyState"
import { AdminPermissions } from "@repo/types/admin-app"
import { formatMealPrice, type AdminMealListResult } from "@/types"

export const metadata: Metadata = { title: "Dishes" }
export const revalidate = 60

const PAGE_SIZE = 10

interface PageProps {
  searchParams: Promise<{
    page?: string; search?: string; country?: string; status?: string
    adminStatus?: string; vendor?: string; vendorName?: string
    outlet?: string; outletName?: string; flagReason?: string
  }>
}

/* "All" carries an explicit `status=all` — an absent param is indistinguishable
 * from a first visit, so the work-queue default below would re-apply itself and
 * the tab could never be selected. Same rule as every other status-tab page. */
const STATUS_TABS: { value: string; label: string }[] = [
  { value: "FLAGGED",           label: "Flagged" },
  { value: "all",               label: "All" },
  { value: "MANUALLY_REJECTED", label: "Sent back" },
  { value: "MANUALLY_APPROVED", label: "Approved" },
  { value: "AUTO_APPROVED",     label: "Auto-approved" },
]

const ADMIN_STATUS_OPTIONS = [
  { value: "ACTIVE",    label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "BANNED",    label: "Banned" },
]

const REVIEW_BADGE: Record<string, string> = {
  AUTO_APPROVED: "badge-neutral", FLAGGED: "badge-warning",
  MANUALLY_APPROVED: "badge-success", MANUALLY_REJECTED: "badge-danger",
}
const REVIEW_LABEL: Record<string, string> = {
  AUTO_APPROVED: "Auto-approved", FLAGGED: "Flagged",
  MANUALLY_APPROVED: "Approved", MANUALLY_REJECTED: "Sent back",
}
const ADMIN_BADGE: Record<string, string> = {
  ACTIVE: "badge-success", SUSPENDED: "badge-warning", BANNED: "badge-danger",
}
const FLAG_LABEL: Record<string, string> = {
  INAPPROPRIATE_NAME       : "Name",
  INAPPROPRIATE_DESCRIPTION: "Description",
  INAPPROPRIATE_PORTION    : "Portion size",
  INAPPROPRIATE_MODIFIER   : "Options",
}

/* The reasons screening writes onto a dish — the backend validates the value
 * against the same list (MENU_ITEM_FLAG_REASONS) and ignores anything else. */
const FLAG_REASON_OPTIONS = [
  { value: "INAPPROPRIATE_NAME",        label: "Name" },
  { value: "INAPPROPRIATE_DESCRIPTION", label: "Description" },
  { value: "INAPPROPRIATE_PORTION",     label: "Portion size" },
  { value: "INAPPROPRIATE_MODIFIER",    label: "Options" },
]

export default async function VendorMealsPage({ searchParams }: PageProps) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.VENDORS_MEALS_READ)) redirect("/vendors")

  const params      = await searchParams
  const page        = params.page   ?? "1"
  const search      = params.search ?? ""
  const country     = params.country ?? ""
  const vendor      = params.vendor ?? ""
  const vendorName  = params.vendorName ?? ""
  const outlet      = params.outlet ?? ""
  const outletName  = params.outletName ?? ""
  const flagReason  = params.flagReason ?? ""
  const adminStatus = params.adminStatus ?? ""
  // Drilling into one vendor or outlet is a "show me everything" view, not a
  // triage queue, so it defaults to All rather than rendering empty.
  const statusTab   = params.status ?? (vendor || outlet ? "all" : "FLAGGED")
  const status      = statusTab === "all" ? "" : statusTab

  const { countries, showFilter } = await getFilterableCountries(session.scope.isGlobal)

  const qsParams: Record<string, string> = { page, pageSize: String(PAGE_SIZE) }
  if (search)      qsParams.search       = search
  if (country)     qsParams.country      = country
  if (status)      qsParams.reviewStatus = status
  if (adminStatus) qsParams.adminStatus  = adminStatus
  if (vendor)      qsParams.vendor       = vendor
  if (outlet)      qsParams.outlet       = outlet
  if (flagReason)  qsParams.flagReason   = flagReason
  const qs = new URLSearchParams(qsParams)

  const tabHref = (value: string) => {
    const qp = new URLSearchParams()
    if (search)      qp.set("search", search)
    if (country)     qp.set("country", country)
    if (adminStatus) qp.set("adminStatus", adminStatus)
    if (vendor)      { qp.set("vendor", vendor); if (vendorName) qp.set("vendorName", vendorName) }
    if (outlet)      { qp.set("outlet", outlet); if (outletName) qp.set("outletName", outletName) }
    if (flagReason)  qp.set("flagReason", flagReason)
    qp.set("status", value)
    return `/meals/dishes?${qp}`
  }

  const result = await adminFetch<AdminMealListResult>(`/admin/v1/vendors/meals?${qs}`, {
    // Thumbnails are stable public derivatives; the short TTL is for the
    // queue's own freshness, and every moderation action purges the tag.
    next: { revalidate: 60, tags: ["vendor-meals"] },
  }).catch(() => null)

  const counts = result?.counts ?? { flagged: 0, rejected: 0, suspended: 0, banned: 0 }
  const anyNeedsAttention = counts.flagged + counts.rejected + counts.suspended + counts.banned > 0

  const statCards = [
    { label: "Flagged",   value: counts.flagged,   icon: Flag,        badgeClass: "icon-badge-warning" },
    { label: "Sent back", value: counts.rejected,  icon: Undo2,       badgeClass: "icon-badge-danger" },
    { label: "Suspended", value: counts.suspended, icon: ShieldAlert, badgeClass: "icon-badge-warning" },
    { label: "Banned",    value: counts.banned,    icon: Ban,         badgeClass: "icon-badge-danger" },
  ]

  return (
    <div className="page-content animate-slide-up">
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/meals" className="hover:text-foreground transition-colors">Meals</Link>
          <span>/</span>
          <span className="text-foreground">Dishes</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="icon-badge icon-badge-primary h-10 w-10">
              <UtensilsCrossed className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Dishes</h1>
              <p className="text-sm text-muted-foreground">
                Each vendor&apos;s reusable dish, reviewed once however many outlets sell it. Decisions here apply
                at every outlet; to act on one outlet, open its{" "}
                <Link href="/meals/listings" className="text-primary hover:underline">listing</Link>.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/vendors/meals/export?${qs}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-[var(--shadow-xs)] transition-colors hover:border-primary/40 hover:text-primary"
          >
            <FileDown className="h-3.5 w-3.5" />
            Export CSV
          </a>
          </div>
        </div>
      </div>

      {(vendor || outlet) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          <span className="text-foreground">
            {outlet ? (
              <>Showing dishes sold at <span className="font-medium">{outletName || "this location"}</span> only.</>
            ) : (
              <>Showing dishes from <span className="font-medium">{vendorName || "this vendor"}</span> only.</>
            )}
          </span>
          <Link href="/meals/dishes" className="view-all-link text-xs">Clear filter</Link>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
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
        {STATUS_TABS.map(({ value, label }) => (
          <Link
            key={value}
            href={tabHref(value)}
            className={[
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
              statusTab === value
                ? "bg-card text-foreground shadow-[var(--shadow-xs)]"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {label}
          </Link>
        ))}
      </div>

      <TableFilterBar
        searchPlaceholder="Search dish or business name…"
        defaultSearch={search}
        {...(showFilter ? { countryOptions: countries.map((c) => ({ value: c.slug, label: c.name })), defaultCountry: country } : {})}
        extraFilters={[
          // Named for the query key the page actually reads. This used to go
          // through categoryOptions, which writes `?category=` — so the status
          // filter never reached the backend.
          { name: "adminStatus", label: "Status", icon: "status", options: ADMIN_STATUS_OPTIONS, defaultValue: adminStatus },
          { name: "flagReason",  label: "Flagged for", allLabel: "Any finding", icon: "filter", options: FLAG_REASON_OPTIONS, defaultValue: flagReason },
        ]}
      />

      {!result ? (
        <div className="admin-card text-sm text-destructive">
          Couldn&apos;t load meals. Reload the page, or check that your admin account still has access to this
          section.
        </div>
      ) : result.items.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title={
            statusTab === "all"
              ? "No meals match these filters"
              : anyNeedsAttention
                ? `No ${(REVIEW_LABEL[statusTab] ?? "matching").toLowerCase()} meals`
                : "Nothing needs attention"
          }
          description={
            statusTab === "all"
              ? "Nothing matches these filters. Clear the search, country or status filter to widen the view."
              : anyNeedsAttention
                ? `Nothing in this tab. Your scope has ${counts.flagged} flagged, ${counts.rejected} sent back and ${counts.suspended} suspended — switch tabs, or view all of them.`
                : "No meal in your scope is flagged, sent back, suspended or banned. View all meals to browse the menu as it stands."
          }
          {...(statusTab === "all" ? {} : { actionLabel: "View all meals", actionHref: tabHref("all") })}
        />
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs uppercase tracking-wide">Dish</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Price</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Review</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide lg:table-cell">Flags</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide">Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((meal) => (
                  <TableRow key={meal.id} className="hover:bg-muted/10">
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {meal.mainImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- public derivative, already sized
                            <img src={meal.mainImageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <ImageOff className="h-3.5 w-3.5" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <Link href={`/meals/dishes/${meal.id}`} className="hover:text-primary hover:underline">
                            {meal.name}
                          </Link>
                          <p className="truncate text-xs font-normal text-muted-foreground">
                            {meal.vendor.legalBusinessName}
                            {meal.outletCount > 0 && ` · ${meal.outletCount} ${meal.outletCount === 1 ? "location" : "locations"}`}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm tabular-nums text-foreground md:table-cell">
                      {formatMealPrice(meal.basePriceMinor, meal.currency)}
                    </TableCell>
                    <TableCell>
                      <span className={REVIEW_BADGE[meal.reviewStatus]}>{REVIEW_LABEL[meal.reviewStatus]}</span>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {meal.flagReasons.length > 0
                        ? meal.flagReasons.map((r) => FLAG_LABEL[r] ?? r).join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={ADMIN_BADGE[meal.adminStatus]}>{meal.adminStatus.toLowerCase()}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      {/* One obvious way in. Moderating from the row would mean
                          deciding without seeing the photo, which is half of
                          what there is to judge. */}
                      <Link
                        href={`/meals/dishes/${meal.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3.5 py-1.5 text-xs font-medium text-foreground shadow-[var(--shadow-xs)] transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        View
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
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
          basePath="/meals/dishes"
          params={{
            ...(search ? { search } : {}), ...(country ? { country } : {}),
            status: statusTab,
            ...(adminStatus ? { adminStatus } : {}),
            ...(vendor ? { vendor, ...(vendorName ? { vendorName } : {}) } : {}),
            ...(outlet ? { outlet, ...(outletName ? { outletName } : {}) } : {}),
            ...(flagReason ? { flagReason } : {}),
          }}
          itemLabel="meals"
        />
      )}
    </div>
  )
}
