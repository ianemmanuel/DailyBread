import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Store, ChevronRight, ImageOff, Layers, CircleSlash, ShieldAlert, EyeOff } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { getFilterableCountries } from "@/lib/countries/filterable-countries"
import { TableFilterBar } from "@/components/shared/TableFilterBar"
import { TablePagination } from "@/components/shared/TablePagination"
import { EmptyState } from "@/components/shared/EmptyState"
import {
  vendorStateOf, platformStatesOf, VENDOR_STATE_OPTIONS, CONTROL_FILTER_OPTIONS,
} from "@/components/vendors/listings/listing-labels"
import { AdminPermissions } from "@repo/types/admin-app"
import { formatMealPrice, type AdminListingListResult } from "@/types"

export const metadata: Metadata = { title: "Listings" }

const PAGE_SIZE = 20

interface PageProps {
  searchParams: Promise<{
    page?: string; search?: string; country?: string; vendorState?: string; control?: string
    vendor?: string; vendorName?: string; outlet?: string; outletName?: string
  }>
}

/**
 * Every dish at every outlet in the admin's scope — "what is on sale where".
 *
 * Read-only browsing: the row says what the listing is and who sells it, and
 * opens the details page, which is where anything is decided.
 */
export default async function MealListingsPage({ searchParams }: PageProps) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.VENDORS_MEALS_READ)) redirect("/vendors")

  const params      = await searchParams
  const page        = params.page ?? "1"
  const search      = params.search ?? ""
  const country     = params.country ?? ""
  const vendorState = params.vendorState ?? ""
  const control     = params.control ?? ""
  const vendor      = params.vendor ?? ""
  const vendorName  = params.vendorName ?? ""
  const outlet      = params.outlet ?? ""
  const outletName  = params.outletName ?? ""

  const { countries, showFilter } = await getFilterableCountries(session.scope.isGlobal)

  const qs = new URLSearchParams({ page, pageSize: String(PAGE_SIZE) })
  if (search)      qs.set("search", search)
  if (country)     qs.set("country", country)
  // "every" is the filter bar's word for the backend's "all": the bar treats
  // "all" as no selection, and no selection means current listings only.
  if (vendorState) qs.set("vendorState", vendorState === "every" ? "all" : vendorState)
  if (control)     qs.set("control", control)
  if (vendor)      qs.set("vendor", vendor)
  if (outlet)      qs.set("outlet", outlet)

  // Uncached: this is where an operator checks the current state of a listing
  // they may have just acted on.
  const result = await adminFetch<AdminListingListResult>(`/admin/v1/vendors/meals/listings?${qs}`, {
    cache: "no-store",
  }).catch(() => null)

  const counts = result?.counts ?? { current: 0, unavailable: 0, hidden: 0, suspended: 0 }
  const statCards = [
    { label: "Current listings", value: counts.current,     icon: Layers,      badgeClass: "icon-badge-primary" },
    { label: "Off today",        value: counts.unavailable, icon: CircleSlash, badgeClass: "icon-badge-warning" },
    { label: "Hidden",           value: counts.hidden,      icon: EyeOff,      badgeClass: "icon-badge-warning" },
    { label: "Suspended",        value: counts.suspended,   icon: ShieldAlert, badgeClass: "icon-badge-danger" },
  ]
  const filtered = !!(search || vendorState || control || vendor || outlet)

  return (
    <div className="page-content animate-slide-up">
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/meals" className="hover:text-foreground transition-colors">Meals</Link>
          <span>/</span>
          <span className="text-foreground">Listings</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="icon-badge icon-badge-primary h-10 w-10">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Listings</h1>
              <p className="text-sm text-muted-foreground">
                Each dish at each outlet that sells it. Content belongs to the vendor; the platform can hide or
                suspend a listing without changing it.
              </p>
            </div>
          </div>
        </div>
      </div>

      {(vendor || outlet) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          <span className="text-foreground">
            {outlet ? (
              <>Showing listings at <span className="font-medium">{outletName || "this outlet"}</span> only.</>
            ) : (
              <>Showing listings from <span className="font-medium">{vendorName || "this vendor"}</span> only.</>
            )}
          </span>
          <Link href="/meals/listings" className="view-all-link text-xs">Clear filter</Link>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      <TableFilterBar
        searchPlaceholder="Search dish, outlet or vendor…"
        defaultSearch={search}
        {...(showFilter ? { countryOptions: countries.map((c) => ({ value: c.slug, label: c.name })), defaultCountry: country } : {})}
        extraFilters={[
          {
            name: "vendorState", label: "Vendor state", allLabel: "Current listings", icon: "status",
            options: VENDOR_STATE_OPTIONS, defaultValue: vendorState,
          },
          {
            name: "control", label: "Platform", allLabel: "Any platform state", icon: "filter",
            options: CONTROL_FILTER_OPTIONS, defaultValue: control,
          },
        ]}
      />

      {!result ? (
        <div className="admin-card text-sm text-destructive">
          Couldn&apos;t load listings. Reload the page, or check that your admin account still has access to this
          section.
        </div>
      ) : result.items.length === 0 ? (
        <EmptyState
          icon={Store}
          title={counts.current === 0 && !filtered ? "No listings in your scope yet" : "No listings match these filters"}
          description={
            counts.current === 0 && !filtered
              ? "Listings appear here once a vendor in your area adds a meal to one of their outlets."
              : `Your scope has ${counts.current} current ${counts.current === 1 ? "listing" : "listings"}. Clear the search or filters to see them.`
          }
          {...(filtered ? { actionLabel: "Clear filters", actionHref: "/meals/listings" } : {})}
        />
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs uppercase tracking-wide">Dish</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Outlet</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide lg:table-cell">Location</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Price</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Vendor</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Platform</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide"><span className="sr-only">Open</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((l) => {
                  const vendorState   = vendorStateOf(l)
                  const platformStates = platformStatesOf(l)
                  return (
                    <TableRow key={l.id} className="hover:bg-muted/10">
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                            {l.dish.mainImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- public derivative, already sized
                              <img src={l.dish.mainImageUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                <ImageOff className="h-3.5 w-3.5" />
                              </div>
                            )}
                          </div>
                          <Link href={`/meals/listings/${l.id}`} className="min-w-0 truncate hover:text-primary hover:underline">
                            {l.dish.name}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <p className="text-foreground">{l.outlet.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          by {l.vendor.displayName ?? l.vendor.legalBusinessName}
                        </p>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        {l.outlet.cityName ?? "—"}, {l.country.name}
                      </TableCell>
                      <TableCell className="hidden text-sm tabular-nums text-foreground md:table-cell">
                        {formatMealPrice(l.listPriceMinor, l.currency)}
                        {l.priceSource === "outlet" && (
                          <span className="ml-1 text-xs text-muted-foreground">(outlet price)</span>
                        )}
                      </TableCell>
                      <TableCell><span className={vendorState.badge}>{vendorState.label}</span></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {platformStates.map((p) => <span key={p.label} className={p.badge}>{p.label}</span>)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/meals/listings/${l.id}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3.5 py-1.5 text-xs font-medium text-foreground shadow-[var(--shadow-xs)] transition-colors hover:border-primary/40 hover:text-primary"
                        >
                          See more
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })}
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
          basePath="/meals/listings"
          params={{
            ...(search ? { search } : {}), ...(country ? { country } : {}),
            ...(vendorState ? { vendorState } : {}), ...(control ? { control } : {}),
            ...(vendor ? { vendor, ...(vendorName ? { vendorName } : {}) } : {}),
            ...(outlet ? { outlet, ...(outletName ? { outletName } : {}) } : {}),
          }}
          itemLabel="listings"
        />
      )}
    </div>
  )
}
