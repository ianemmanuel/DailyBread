import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft, Pencil, CalendarClock, Store, UtensilsCrossed, Gauge, BarChart3, Ban,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { requireSetupAccess } from "@/lib/vendor/guards"
import { getDiscount } from "@/lib/vendor/discounts"
import { getMenuContext } from "@/lib/vendor/menu"
import { formatPrice } from "@/lib/menu/money"
import { DiscountStateBadge } from "@/components/discounts/DiscountStateBadge"

export const metadata = { title: "Offer" }

/*
 * One offer, at a glance.
 *
 * Deliberately NOT the edit form — that lives at /offers/[id]/edit. This is
 * where an offer's performance will go once there are orders to measure, which
 * is why it exists now with only its details: a page you land on to understand
 * an offer, rather than one you land on already editing it.
 */

const DAY_SHORT: Record<string, string> = {
  MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu",
  FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun",
}

export default async function OfferDetailPage({
  params,
}: {
  params: Promise<{ discountId: string }>
}) {
  await requireSetupAccess()
  const { discountId } = await params

  const [offer, context] = await Promise.all([getDiscount(discountId), getMenuContext()])
  if (!offer) notFound()

  const currency = context.currency
  const isPercentage = offer.type === "PERCENTAGE_OFF_ITEMS"

  const value = isPercentage
    ? `${Number(((offer.percentBps ?? 0) / 100).toFixed(2))}% off`
    : `${formatPrice(offer.amountMinor ?? 0, currency)} off`

  const when = [
    offer.daysOfWeek.length === 0 ? "Every day" : offer.daysOfWeek.map((d) => DAY_SHORT[d] ?? d).join(", "),
    offer.startTime && offer.endTime ? `${offer.startTime}–${offer.endTime}` : "All day",
  ].join(" · ")

  return (
    <div className="space-y-6">
      <Link
        href="/offers"
        className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="size-4" />
        Back to offers
      </Link>

      <PageHeader
        title={offer.name}
        description={offer.description ?? "Your own offer, funded by you."}
        actions={
          offer.state !== "SUSPENDED" ? (
            <Button asChild size="sm" className="cursor-pointer gap-1.5 transition-transform hover:scale-105">
              <Link href={`/offers/${offer.id}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <DiscountStateBadge state={offer.state} appliesNow={offer.appliesNow} />
      </div>

      {offer.suspensionReason && (
        <div className="dash-card flex items-start gap-3 border-[var(--destructive)]/40 p-4">
          <Ban className="mt-0.5 size-4 shrink-0 text-[var(--destructive)]" />
          <div className="text-sm">
            <p className="font-medium text-[var(--foreground)]">Stopped by DailyBread</p>
            <p className="mt-1 text-[var(--muted-foreground)]">{offer.suspensionReason}</p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              You can&apos;t edit or resume this one. Get in touch if you think it&apos;s a mistake.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card icon={Gauge} title="What it takes off">
          <p className="font-display text-2xl font-semibold text-[var(--foreground)]">{value}</p>
          {!isPercentage && offer.minSubtotalMinor && (
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Once the basket reaches {formatPrice(offer.minSubtotalMinor, currency)}
            </p>
          )}
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
            Commission is charged on the discounted price, so DailyBread takes no cut of what you
            give away.
          </p>
        </Card>

        <Card icon={CalendarClock} title="When it runs">
          <dl className="space-y-1.5 text-sm">
            <Row term="Starts" value={new Date(offer.startsAt).toLocaleString()} />
            <Row term="Ends" value={offer.endsAt ? new Date(offer.endsAt).toLocaleString() : "Until you stop it"} />
            <Row term="Pattern" value={when} />
          </dl>
        </Card>

        <Card icon={Gauge} title="Limits">
          <dl className="space-y-1.5 text-sm">
            <Row term="Budget" value={offer.budgetMinor ? formatPrice(offer.budgetMinor, currency) : "None"} />
            <Row term="Max uses" value={offer.maxRedemptions ? String(offer.maxRedemptions) : "Unlimited"} />
            <Row term="Per customer" value={offer.maxPerCustomer ? String(offer.maxPerCustomer) : "Unlimited"} />
          </dl>
          {!offer.capsEnforced && (
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              These start applying once customers can order.
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card icon={Store} title="Locations">
          {offer.appliesToAllOutlets ? (
            <p className="text-sm text-[var(--muted-foreground)]">All your locations.</p>
          ) : (
            <ul className="space-y-1.5 text-sm text-[var(--foreground)]">
              {offer.outlets.map((o) => <li key={o.id}>{o.name}</li>)}
            </ul>
          )}
        </Card>

        <Card icon={UtensilsCrossed} title="Dishes">
          {!isPercentage ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              This comes off the whole basket, so it isn&apos;t tied to particular dishes.
            </p>
          ) : offer.appliesToAllItems ? (
            <p className="text-sm text-[var(--muted-foreground)]">Every dish on your menu.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {offer.items.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/meals/${i.id}`}
                    className="cursor-pointer text-[var(--foreground)] hover:text-[var(--primary)] hover:underline"
                  >
                    {i.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/*
        * Performance goes here. Stated rather than left blank so it is clearly
        * pending work and not an oversight — there is no order model yet, so
        * every figure would be invented, and showing a vendor made-up numbers
        * about their own business is not acceptable.
        */}
      <div className="dash-card flex items-start gap-3 border-dashed p-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--muted)]">
          <BarChart3 className="size-4 text-[var(--muted-foreground)]" />
        </span>
        <div className="text-sm">
          <p className="font-medium text-[var(--foreground)]">Performance</p>
          <p className="mt-1 leading-relaxed text-[var(--muted-foreground)]">
            How many customers used this, what it earned and what it cost you will appear here once
            orders are live. Nothing is shown until the numbers are real.
          </p>
        </div>
      </div>
    </div>
  )
}

function Card({
  icon: Icon, title, children,
}: {
  icon: React.ElementType; title: string; children: React.ReactNode
}) {
  return (
    <section className="dash-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-[var(--primary)]/10">
          <Icon className="size-3.5 text-[var(--primary)]" />
        </span>
        <h2 className="text-sm font-semibold text-[var(--foreground)]">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--muted-foreground)]">{term}</dt>
      <dd className="text-right text-[var(--foreground)]">{value}</dd>
    </div>
  )
}
