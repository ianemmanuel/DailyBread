import { redirect } from "next/navigation"
import { Globe2, Store, Layers } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { getFilterableCountries } from "@/lib/countries/filterable-countries"
import { getScopeTier } from "@/lib/auth/scope-tier"
import { TableFilterBar, type FilterStatusOption } from "@/components/shared/TableFilterBar"
import { TablePagination } from "@/components/shared/TablePagination"
import { OfferAllSwitch } from "./OfferAllSwitch"
import { FoodTagsTable } from "./FoodTagsTable"
import { FoodTagFormSheet } from "./FoodTagFormSheet"
import { FOOD_TAG_META, type FoodTagKind, type FoodTagListResult } from "@/types/food-tag.types"

/*
 * The whole screen for one catalog, so the two route files stay three lines of
 * delegation each. Cuisines and dietary tags are identical in every way that
 * matters here, so they share this rather than being copy-pasted.
 *
 * Two audiences on one page, which is the point:
 *   a GLOBAL admin manages the catalog and can pick a country to curate;
 *   a COUNTRY-scoped admin can't create anything, and their own country is
 *   resolved server-side so the availability switches are simply there.
 */

const PAGE_SIZE = 10

const STATUS_OPTIONS: FilterStatusOption[] = [
  { value: "ACTIVE",     label: "Active",    dot: "bg-success" },
  { value: "SUSPENDED",  label: "Suspended", dot: "bg-warning" },
  { value: "DEPRECATED", label: "Retired",   dot: "bg-destructive" },
]

interface Props {
  kind        : FoodTagKind
  searchParams: Promise<{
    country?: string
    search? : string
    status? : string
    offered?: string
    page?   : string
  }>
}

export async function FoodTagsCatalog({ kind, searchParams }: Props) {
  const session = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.SETTINGS_FOOD_TAGS_READ)) redirect("/overview")

  const meta = FOOD_TAG_META[kind]
  const params = await searchParams

  const hasWrite = session.permissions.includes(AdminPermissions.SETTINGS_FOOD_TAGS_WRITE)
  /*
   * Catalog mutations are GLOBAL-only in the backend, so a country-scoped
   * admin holding the write key would still 403. Hide the controls rather than
   * render-then-403 — the same reasoning the vendor-categories page uses.
   */
  const canManageCatalog = hasWrite && session.scope.isGlobal

  /*
   * What a market offers is a country-wide decision, so a city-tier admin only
   * ever reads it. The backend refuses them too (assertCountryPolicyScope) —
   * this just stops rendering a switch that could only 403.
   */
  const canManageCountry = hasWrite && getScopeTier(session) !== "CITY"

  const { countries, showFilter } = await getFilterableCountries(session.scope.isGlobal)
  const selectedSlug = params.country ?? "all"
  const selectedCountry = countries.find((c) => c.slug === selectedSlug) ?? null

  const qs = new URLSearchParams({ page: params.page ?? "1", pageSize: String(PAGE_SIZE) })
  if (selectedCountry) qs.set("countryId", selectedCountry.id)
  if (params.search)   qs.set("search", params.search)
  if (params.status)   qs.set("status", params.status)
  if (params.offered)  qs.set("availability", params.offered)

  const result = await adminFetch<FoodTagListResult>(`/admin/v1/food-tags/${kind}?${qs}`, {
    next: { revalidate: 60, tags: [`food-tags-${kind}`] },
  }).catch(() => null)

  /*
   * A failed load is said out loud rather than rendered as an empty catalog —
   * "no entries" and "the request failed" look identical otherwise, which is
   * exactly how a working page reads as broken.
   */
  if (!result) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader icon={Layers} title={meta.title} description={meta.description} />
        <div className="admin-card text-sm text-destructive">
          Couldn&apos;t load {meta.title.toLowerCase()}. Reload the page, or check that your admin account still
          has access to this section.
        </div>
      </div>
    )
  }

  /*
   * The backend resolves a country-scoped admin's own country for them when
   * they didn't pick one, so trust its answer rather than re-deriving it here.
   */
  const countryId = result.countryId
  const countryName = countryId
    ? (countries.find((c) => c.id === countryId)?.name ?? "your country")
    : null

  // The bulk endpoint accepts a slug or an id; the id is what we reliably have
  // for a country-scoped admin, who never picked a slug.
  const countryRef = selectedCountry?.slug ?? countryId ?? ""

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        icon={Layers}
        title={meta.title}
        description={meta.description}
        actions={
          canManageCatalog
            ? <FoodTagFormSheet kind={kind} singular={meta.singular} withTrigger />
            : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Layers} label="In the catalog" value={result.total} />
        <StatCard icon={Globe2} label="Active globally" value={result.activeTotal} />
        <StatCard
          icon={Store}
          label={countryName ? `Offered in ${countryName}` : "Pick a country to curate"}
          value={result.countryEnabledCount ?? "—"}
        />
      </div>

      {/* One switch for the whole market, sitting above the per-row switches
          it summarises. */}
      {countryId && countryName && (
        <OfferAllSwitch
          kind={kind}
          countryRef={countryRef}
          countryName={countryName}
          enabledCount={result.countryEnabledCount ?? 0}
          activeTotal={result.activeTotal}
          disabled={!canManageCountry}
        />
      )}

      <TableFilterBar
        searchPlaceholder={`Search ${meta.singular}s…`}
        defaultSearch={params.search ?? ""}
        statusOptions={STATUS_OPTIONS}
        defaultStatus={params.status ?? ""}
        /* Only a global admin gets a country picker (getFilterableCountries
           returns showFilter: isGlobal && >1), so a Kenyan admin has no way to
           look at another market — the backend scope-checks it regardless. */
        countryOptions={showFilter ? countries.map((c) => ({ value: c.slug, label: c.name })) : undefined}
        defaultCountry={selectedSlug}
        /* Availability only means anything once a country is in view, and it
           goes through the generic extraFilters path rather than becoming a
           fourth named prop trio on the shared component. */
        extraFilters={countryId ? [{
          name        : "offered",
          label       : "Availability",
          allLabel    : "Offered or not",
          defaultValue: params.offered ?? "all",
          icon        : "store",
          options     : [
            { value: "ENABLED",  label: `Offered in ${countryName}` },
            { value: "DISABLED", label: "Not offered" },
          ],
        }] : undefined}
      />

      {!countryId && session.scope.isGlobal && (
        <p className="text-sm text-muted-foreground">
          Choose a country above to switch entries on or off for that market. Without one you&apos;re looking at
          the global catalog only.
        </p>
      )}

      <FoodTagsTable
        kind={kind}
        singular={meta.singular}
        tags={result.tags}
        countryId={countryId}
        countryName={countryName}
        canManageCatalog={canManageCatalog}
        canManageCountry={canManageCountry && countryId !== null}
      />

      <TablePagination
        basePath={`/food-tags/${kind}`}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        itemLabel={`${meta.singular}s`}
        params={{
          ...(params.country ? { country: params.country } : {}),
          ...(params.search  ? { search : params.search  } : {}),
          ...(params.status  ? { status : params.status  } : {}),
          ...(params.offered ? { offered: params.offered } : {}),
        }}
      />
    </div>
  )
}

function StatCard({
  icon: Icon, label, value,
}: {
  icon : typeof Globe2
  label: string
  value: number | string
}) {
  return (
    <div className="admin-card flex items-center gap-3 p-4">
      <div className="icon-badge icon-badge-primary h-10 w-10"><Icon className="size-4" /></div>
      <div className="min-w-0">
        <p className="text-lg font-semibold text-foreground">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
