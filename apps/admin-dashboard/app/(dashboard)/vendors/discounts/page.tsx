import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { BadgePercent, AlertTriangle } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { TablePagination } from "@/components/shared/TablePagination"
import { EmptyState } from "@/components/shared/EmptyState"
import { DiscountSuspendActions } from "@/components/vendors/DiscountSuspendActions"

export const metadata: Metadata = { title: "Offers" }

/*
 * Vendor offers, platform-wide.
 *
 * OVERSIGHT, NOT AUTHORING. Merchants self-serve their own promotions with no
 * approval queue, which is how every platform worth copying works; what an
 * admin gets is visibility and a stop button. Creating platform-funded
 * campaigns is a separate, deferred concern — which is why this page uses
 * finance:discounts:read / :deactivate and never :create.
 *
 * COUNTRY-SCOPED by the vendor's own country, enforced in the service. A global
 * admin sees every market; a country-scoped one sees only theirs.
 */

const PAGE_SIZE = 20

const STATE_TABS = [
  { value: "all",              label: "All" },
  { value: "RUNNING",          label: "Running" },
  { value: "SCHEDULED",        label: "Scheduled" },
  { value: "AWAITING_GO_LIVE", label: "Waiting on go-live" },
  { value: "PAUSED",           label: "Paused" },
  { value: "SUSPENDED",        label: "Stopped" },
  { value: "EXPIRED",          label: "Finished" },
] as const

interface AdminDiscount {
  id: string
  name: string
  type: "PERCENTAGE_OFF_ITEMS" | "AMOUNT_OFF_ORDER"
  percentBps: number | null
  amountMinor: number | null
  minSubtotalMinor: number | null
  startsAt: string
  endsAt: string | null
  state: string
  appliesNow: boolean
  suspendedAt: string | null
  suspensionReason: string | null
  appliesToAllOutlets: boolean
  appliesToAllItems: boolean
  outletCount: number
  itemCount: number
  vendor: {
    id: string
    businessName: string
    countryName: string | null
    currencyCode: string | null
    isLive: boolean
  }
}

interface Result {
  discounts: AdminDiscount[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  scanCapped: boolean
}

export default async function AdminDiscountsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; search?: string; vendor?: string; page?: string }>
}) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.FINANCE_DISCOUNTS_READ)) redirect("/vendors")

  const canStop = session.permissions.includes(AdminPermissions.FINANCE_DISCOUNTS_DEACTIVATE)
  const params = await searchParams
  const stateTab = params.state ?? "all"

  const qs = new URLSearchParams({ page: params.page ?? "1", pageSize: String(PAGE_SIZE) })
  if (stateTab !== "all") qs.set("state", stateTab)
  if (params.search) qs.set("search", params.search)
  if (params.vendor) qs.set("vendor", params.vendor)

  const result = await adminFetch<Result>(`/admin/v1/vendors/discounts?${qs}`, {
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

  const tabHref = (value: string) => {
    const next = new URLSearchParams()
    // Always explicit, never absent: an omitted param is indistinguishable from
    // a first visit, which is how an "All" tab becomes unreachable.
    next.set("state", value)
    if (params.search) next.set("search", params.search)
    if (params.vendor) next.set("vendor", params.vendor)
    return `/vendors/discounts?${next}`
  }

  const money = (minor: number, code: string | null) =>
    new Intl.NumberFormat(undefined, {
      style: "currency", currency: code ?? "USD", maximumFractionDigits: 2,
    }).format(minor / 100)

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
          <Link href="/vendors/discounts?state=all" className="text-primary hover:underline">
            Clear filter
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {STATE_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tabHref(tab.value)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              stateTab === tab.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {result.scanCapped && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          There are more offers than this page scans, so the counts are a floor rather than a total.
        </p>
      )}

      {result.discounts.length === 0 ? (
        <EmptyState
          icon={BadgePercent}
          title="Nothing here"
          description={
            stateTab === "all"
              ? "No vendor has created an offer in your markets yet."
              : "No offers in this state right now. Try the All tab."
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
                    <th className="px-4 py-3 font-medium">Applies to</th>
                    <th className="px-4 py-3 font-medium">State</th>
                    {canStop && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {result.discounts.map((d) => (
                    <tr key={d.id} className="border-b align-top last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{d.name}</p>
                        {d.suspensionReason && (
                          <p className="mt-0.5 max-w-xs text-xs text-destructive">{d.suspensionReason}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/vendors/accounts/${d.vendor.id}`}
                          className="text-foreground hover:text-primary hover:underline"
                        >
                          {d.vendor.businessName}
                        </Link>
                        <p className="text-xs text-muted-foreground">{d.vendor.countryName ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {d.type === "PERCENTAGE_OFF_ITEMS"
                          ? `${Number(((d.percentBps ?? 0) / 100).toFixed(2))}% off`
                          : `${money(d.amountMinor ?? 0, d.vendor.currencyCode)} off`}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {d.appliesToAllOutlets ? "All locations" : `${d.outletCount} location(s)`}
                        {d.type === "PERCENTAGE_OFF_ITEMS" &&
                          (d.appliesToAllItems ? " · every dish" : ` · ${d.itemCount} dish(es)`)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={d.state === "RUNNING" ? "badge-success" : "badge-muted"}>
                          {d.state.replace(/_/g, " ").toLowerCase()}
                        </span>
                        {d.state === "RUNNING" && !d.appliesNow && (
                          <p className="mt-0.5 text-xs text-muted-foreground">outside its hours</p>
                        )}
                      </td>
                      {canStop && (
                        <td className="px-4 py-3 text-right">
                          <DiscountSuspendActions
                            discountId={d.id}
                            name={d.name}
                            isSuspended={!!d.suspendedAt}
                          />
                        </td>
                      )}
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
              state: stateTab,
              ...(params.search ? { search: params.search } : {}),
              ...(params.vendor ? { vendor: params.vendor } : {}),
            }}
            itemLabel="offers"
          />
        </>
      )}
    </div>
  )
}
