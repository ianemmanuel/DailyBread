import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { BadgePercent } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { TableFilterBar, type FilterStatusOption } from "@/components/shared/TableFilterBar"
import { TablePagination } from "@/components/shared/TablePagination"
import { EmptyState } from "@/components/shared/EmptyState"
import { getFilterableCountries } from "@/lib/countries/filterable-countries"
import {
  DISCOUNT_STATE_LABEL, formatDiscountValue,
  type AdminDiscountListResult, type AdminDiscountState,
} from "@/types/discount.types"

export const metadata: Metadata = { title: "Offers" }

/*
 * Vendor offers, as a QUEUE.
 *
 * Name, vendor, value, state, and one obvious way in. Targets, caps, the
 * description and the stop button all live on the detail page, because a
 * decision about someone's promotion should not be made from a table row that
 * cannot show what the offer actually covers — the same split
 * /finance/payout-accounts and /vendors/meals already use.
 *
 * OVERSIGHT, NOT AUTHORING: merchants self-serve, so there is no create here.
 * Country-scoped on the vendor's own country, enforced in the service.
 */

const PAGE_SIZE = 20

const STATE_OPTIONS: FilterStatusOption[] = [
  { value: "RUNNING",          label: "Running",            dot: "bg-success" },
  { value: "SCHEDULED",        label: "Scheduled",          dot: "bg-info" },
  { value: "AWAITING_GO_LIVE", label: "Waiting on go-live", dot: "bg-warning" },
  { value: "PAUSED",           label: "Paused by vendor",   dot: "bg-muted-foreground" },
  { value: "SUSPENDED",        label: "Stopped by us",      dot: "bg-destructive" },
  { value: "EXPIRED",          label: "Finished",           dot: "bg-muted-foreground" },
  { value: "EXHAUSTED",        label: "Budget used up",     dot: "bg-muted-foreground" },
]

interface Search {
  state?: string; search?: string; country?: string; vendor?: string; page?: string
}

export default async function AdminDiscountsPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.FINANCE_DISCOUNTS_READ)) redirect("/vendors")

  const params = await searchParams
  const { countries, showFilter } = await getFilterableCountries(session.scope.isGlobal)
  const selectedCountry = countries.find((c) => c.slug === params.country) ?? null

  const qs = new URLSearchParams({ page: params.page ?? "1", pageSize: String(PAGE_SIZE) })
  if (params.state && params.state !== "all") qs.set("state", params.state)
  if (params.search) qs.set("search", params.search)
  if (params.vendor) qs.set("vendor", params.vendor)
  if (selectedCountry) qs.set("countryId", selectedCountry.id)

  const result = await adminFetch<AdminDiscountListResult>(`/admin/v1/vendors/discounts?${qs}`, {
    // An offer's state is time-derived, so a cached page would show a scheduled
    // offer as still scheduled minutes after it started.
    cache: "no-store",
  }).catch(() => null)

  if (!result) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader icon={BadgePercent} title="Offers" description="Vendor-funded promotions" />
        <div className="admin-card border-destructive/40 p-6">
          <p className="text-sm font-medium text-destructive">Couldn&apos;t load offers.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The request failed rather than coming back empty.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={BadgePercent}
        title="Offers"
        description="Promotions vendors fund themselves. You can see them and stop them."
      />

      {params.vendor && (
        <div className="admin-card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
          <span className="text-muted-foreground">Showing one vendor only.</span>
          <Link href="/vendors/discounts" className="text-primary hover:underline">Clear filter</Link>
        </div>
      )}

      <TableFilterBar
        searchPlaceholder="Offer or vendor name…"
        defaultSearch={params.search}
        statusLabel="State"
        statusOptions={STATE_OPTIONS}
        defaultStatus={params.state}
        countryOptions={showFilter ? countries.map((c) => ({ value: c.slug, label: c.name })) : undefined}
        defaultCountry={params.country}
      />

      {result.discounts.length === 0 ? (
        <EmptyState
          icon={BadgePercent}
          title="Nothing here"
          description={
            params.search || params.state || params.country
              ? "No offers match these filters. Try clearing them."
              : "No vendor has created an offer in your markets yet."
          }
        />
      ) : (
        <>
          <div className="admin-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Offer</th>
                    <th className="px-4 py-3 font-medium">Vendor</th>
                    <th className="px-4 py-3 font-medium">Value</th>
                    <th className="px-4 py-3 font-medium">State</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {result.discounts.map((d) => (
                    <tr key={d.id} className="border-b align-top last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">{d.name}</td>
                      <td className="px-4 py-3">
                        <p className="text-foreground">{d.vendor.businessName}</p>
                        <p className="text-xs text-muted-foreground">{d.vendor.countryName ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatDiscountValue(d, d.vendor.currencyCode)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={d.state === "RUNNING" ? "badge-success" : "badge-muted"}>
                          {DISCOUNT_STATE_LABEL[d.state as AdminDiscountState]}
                        </span>
                        {d.state === "RUNNING" && !d.appliesNow && (
                          <p className="mt-0.5 text-xs text-muted-foreground">outside its hours</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/vendors/discounts/${d.id}`}
                          className="inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-xs font-medium text-foreground transition-all hover:scale-105 hover:border-primary hover:bg-muted"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <TablePagination
            total={result.total}
            page={result.page}
            totalPages={result.totalPages}
            basePath="/vendors/discounts"
            params={{
              ...(params.state ? { state: params.state } : {}),
              ...(params.search ? { search: params.search } : {}),
              ...(params.country ? { country: params.country } : {}),
              ...(params.vendor ? { vendor: params.vendor } : {}),
            }}
            itemLabel="offers"
          />
        </>
      )}
    </div>
  )
}
