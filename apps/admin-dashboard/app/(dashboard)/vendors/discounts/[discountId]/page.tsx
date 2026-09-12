import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Store, UtensilsCrossed, CalendarClock, Gauge, Ban } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { DiscountSuspendActions } from "@/components/vendors/DiscountSuspendActions"
import {
  DISCOUNT_STATE_LABEL, formatDiscountValue, type AdminDiscountDetail,
} from "@/types/discount.types"

export const metadata: Metadata = { title: "Offer" }

/*
 * One offer, and the decision about it.
 *
 * Everything the queue leaves out lives here: what it covers, when it runs, its
 * caps, and the stop button. Deliberately SSR and short — the only client
 * component is the action pair, which is the only thing that needs to be.
 *
 * Customer engagement on an offer goes here when there are orders to measure.
 */

const DAY_SHORT: Record<string, string> = {
  MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu",
  FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun",
}

export default async function AdminDiscountDetailPage({
  params,
}: {
  params: Promise<{ discountId: string }>
}) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.FINANCE_DISCOUNTS_READ)) redirect("/vendors")
  const canStop = session.permissions.includes(AdminPermissions.FINANCE_DISCOUNTS_DEACTIVATE)

  const { discountId } = await params
  const offer = await adminFetch<AdminDiscountDetail>(
    `/admin/v1/vendors/discounts/${discountId}/detail`,
    { cache: "no-store" },
  ).catch((err) => {
    if (err instanceof ApiCallError && err.status === 404) return null
    throw err
  })
  if (!offer) notFound()

  const money = (minor: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency", currency: offer.vendor.currencyCode ?? "USD", maximumFractionDigits: 2,
    }).format(minor / 100)

  const when = [
    offer.daysOfWeek.length === 0
      ? "Every day"
      : offer.daysOfWeek.map((d) => DAY_SHORT[d] ?? d).join(", "),
    offer.startTime && offer.endTime ? `${offer.startTime}–${offer.endTime}` : "All day",
  ].join(" · ")

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/vendors/discounts"
        className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to offers
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {offer.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link href={`/vendors/accounts/${offer.vendor.id}`} className="cursor-pointer hover:text-primary hover:underline">
              {offer.vendor.businessName}
            </Link>
            {offer.vendor.countryName && ` · ${offer.vendor.countryName}`}
            {" · funded by "}
            {offer.fundingSource === "VENDOR" ? "the vendor" : offer.fundingSource.toLowerCase()}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={offer.state === "RUNNING" ? "badge-success" : "badge-muted"}>
              {DISCOUNT_STATE_LABEL[offer.state]}
            </span>
            {offer.state === "RUNNING" && !offer.appliesNow && (
              <span className="text-xs text-muted-foreground">outside its hours right now</span>
            )}
          </div>
        </div>

        {canStop && (
          <DiscountSuspendActions
            discountId={offer.id}
            name={offer.name}
            isSuspended={!!offer.suspendedAt}
          />
        )}
      </div>

      {offer.suspendedAt && (
        <div className="admin-card flex items-start gap-3 border-destructive/40 p-4">
          <Ban className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-foreground">
              Stopped{offer.suspendedBy ? ` by ${offer.suspendedBy.name}` : ""}
            </p>
            <p className="mt-1 text-muted-foreground">{offer.suspensionReason}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The vendor sees this wording and cannot edit or resume the offer.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="What it takes off" icon={<Gauge className="size-4" />}>
          <p className="font-display text-xl font-semibold text-foreground">
            {formatDiscountValue(offer, offer.vendor.currencyCode)}
          </p>
          {offer.description && (
            <p className="mt-2 text-sm text-muted-foreground">{offer.description}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Commission is charged on the discounted amount, so this comes out of the vendor&apos;s
            share rather than ours.
          </p>
        </Card>

        <Card title="When it runs" icon={<CalendarClock className="size-4" />}>
          <dl className="space-y-1.5 text-sm">
            <Row term="Starts" value={new Date(offer.startsAt).toLocaleString()} />
            <Row term="Ends" value={offer.endsAt ? new Date(offer.endsAt).toLocaleString() : "No end date"} />
            <Row term="Pattern" value={when} />
          </dl>
        </Card>

        <Card title="Limits" icon={<Gauge className="size-4" />}>
          <dl className="space-y-1.5 text-sm">
            <Row term="Budget" value={offer.budgetMinor ? money(offer.budgetMinor) : "None"} />
            <Row term="Max uses" value={offer.maxRedemptions ? String(offer.maxRedemptions) : "Unlimited"} />
          </dl>
          {!offer.capsEnforced && (
            <p className="mt-2 text-xs text-muted-foreground">
              Recorded but not enforced yet — there are no orders to count against.
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Locations" icon={<Store className="size-4" />}>
          {offer.appliesToAllOutlets ? (
            <p className="text-sm text-muted-foreground">Every location this vendor operates.</p>
          ) : offer.outlets.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {offer.outlets.map((o) => (
                <li key={o.id}>
                  <Link href={`/outlets/${o.id}`} className="cursor-pointer text-foreground hover:text-primary hover:underline">
                    {o.name}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground">{o.addressLine1}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Dishes" icon={<UtensilsCrossed className="size-4" />}>
          {offer.type === "AMOUNT_OFF_ORDER" ? (
            <p className="text-sm text-muted-foreground">
              This comes off the whole basket, so it isn&apos;t tied to particular dishes.
            </p>
          ) : offer.appliesToAllItems ? (
            <p className="text-sm text-muted-foreground">Every dish on the menu.</p>
          ) : offer.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {offer.items.map((i) => (
                <li key={i.id} className="flex items-baseline justify-between gap-3">
                  <Link href={`/vendors/meals/${i.id}`} className="cursor-pointer text-foreground hover:text-primary hover:underline">
                    {i.name}
                  </Link>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {money(i.basePriceMinor)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function Card({
  title, icon, children,
}: {
  title: string; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="admin-card space-y-3 p-5">
      <div className="flex items-center gap-2">
        <span className="icon-badge">{icon}</span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="text-right text-foreground">{value}</dd>
    </div>
  )
}
