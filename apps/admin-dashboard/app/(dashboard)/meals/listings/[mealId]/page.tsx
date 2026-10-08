import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, CircleAlert, ArrowUpRight, Lock } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { MEAL_REASON_ACTION_LABEL } from "@repo/types/enums"
import {
  BLOCKER_LABEL, CONTROL_ACTION_LABEL, vendorStateOf, platformStatesOf,
} from "@/components/vendors/listings/listing-labels"
import { ListingControls } from "@/components/vendors/listings/ListingControls"
import { RelationCard } from "@/components/meals/RelationCard"
import { ListingGallery } from "@/components/meals/ListingGallery"
import { EscalationResolveButton } from "@/components/meals/EscalationResolveButton"
import { formatMealPrice, type AdminListingDetail } from "@/types"

export const metadata: Metadata = { title: "Listing" }

interface Props { params: Promise<{ mealId: string }> }

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—"
}

/** One label/value row in a dense ERP list. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{children}</dd>
    </div>
  )
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold text-foreground">{children}</h2>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

/**
 * One listing — one dish sold at one outlet — as an ERP workspace:
 *
 *   what it is and what the customer sees  (left: photos, words, price, options)
 *   where it exists                        (the Dish / Outlet / Vendor strip)
 *   its marketplace state and what to do   (right: visibility, controls, escalation)
 *   what happened                          (right: timeline and control history)
 *
 * Everything is the server's answer; the only writes are the platform's own
 * marketplace controls. Vendor content is read-only here.
 */
export default async function MealListingDetailPage({ params }: Props) {
  const { mealId } = await params
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.VENDORS_MEALS_READ)) redirect("/vendors")
  const canModerate = session.permissions.includes(AdminPermissions.VENDORS_MEALS_MODERATE)

  let listing: AdminListingDetail
  try {
    listing = await adminFetch<AdminListingDetail>(`/admin/v1/vendors/meals/listings/${mealId}`, { cache: "no-store" })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const { dish, outlet } = listing
  const price          = (minor: number) => formatMealPrice(minor, listing.currency)
  const vendorState    = vendorStateOf(listing)
  const platformStates = platformStatesOf(listing)
  const vendorName     = listing.vendor.displayName ?? listing.vendor.legalBusinessName
  const esc            = listing.escalation.latest
  const outletIssues   = [
    outlet.deletedAt                     && "Outlet deleted",
    outlet.adminStatus !== "ACTIVE"      && `Outlet ${outlet.adminStatus.toLowerCase().replace("_", " ")}`,
    outlet.clearanceStatus !== "CLEARED" && "Outlet not cleared to sell",
    (outlet.reviewStatus === "FLAGGED" || outlet.reviewStatus === "MANUALLY_REJECTED") && "Outlet under review",
    outlet.isTemporarilyClosed           && "Outlet temporarily closed",
  ].filter((x): x is string => !!x)

  return (
    <div className="page-content animate-slide-up">
      {/* ── What is this? ─────────────────────────────────────────── */}
      <div>
        <Link
          href="/meals/listings"
          className="group inline-flex w-fit items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card shadow-[var(--shadow-xs)] transition-all group-hover:-translate-x-0.5 group-hover:border-primary/40 group-hover:text-primary">
            <ArrowLeft className="h-4 w-4" />
          </span>
          Back to listings
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Listing</p>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {dish.name} <span className="text-muted-foreground">— {outlet.name}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {outlet.cityName ?? "Unknown city"}, {listing.country.name} · by {vendorName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={vendorState.badge}>{vendorState.label}</span>
            {platformStates.map((p) => <span key={p.label} className={p.badge}>{p.label}</span>)}
            {esc?.status === "PENDING" && <span className="badge-warning">Escalated</span>}
          </div>
        </div>
      </div>

      {/* ── Where does it exist? ──────────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-3">
        <RelationCard
          kind="dish"
          title={dish.name}
          subtitle={`Sold at ${dish.outletCount} ${dish.outletCount === 1 ? "outlet" : "outlets"}`}
          imageUrl={dish.mainImageUrl}
          href={`/meals/dishes/${dish.id}`}
          linkLabel="View dish"
        />
        <RelationCard
          kind="outlet"
          title={outlet.name}
          subtitle={[outlet.areaName, outlet.cityName, listing.country.name].filter(Boolean).join(" · ")}
          href={`/outlets/${outlet.id}`}
          linkLabel="View outlet"
        />
        <RelationCard
          kind="vendor"
          title={vendorName}
          subtitle={listing.vendor.displayName && listing.vendor.displayName !== listing.vendor.legalBusinessName
            ? listing.vendor.legalBusinessName : null}
          href={`/vendors/accounts/${listing.vendor.id}`}
          linkLabel="View vendor"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
        {/* ── What does the customer see? ─────────────────────────── */}
        <section className="admin-card space-y-5">
          <SectionTitle hint={<span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Managed by the vendor</span>}>
            What the customer sees
          </SectionTitle>

          <div className="grid gap-5 md:grid-cols-2">
            <ListingGallery images={dish.images} name={dish.name} />
            <div className="min-w-0 space-y-3">
              <div>
                <p className="font-display text-lg font-semibold text-foreground">{dish.name}</p>
                <p className="text-lg font-semibold tabular-nums text-foreground">
                  {price(listing.listPriceMinor)}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {listing.priceSource === "outlet"
                      ? `this outlet's price · catalogue ${price(dish.basePriceMinor)}`
                      : "catalogue price"}
                  </span>
                </p>
              </div>
              {dish.description ? (
                <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground">{dish.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No description.</p>
              )}
              {(dish.cuisines.length > 0 || dish.dietaryTags.length > 0 || dish.portionSize) && (
                <div className="flex flex-wrap gap-1.5">
                  {dish.portionSize && <span className="badge-neutral">{dish.portionSize}</span>}
                  {dish.cuisines.map((c) => <span key={c.id} className="badge-neutral">{c.name}</span>)}
                  {dish.dietaryTags.map((d) => (
                    <span key={d.id} className="rounded-full border border-success/30 bg-success-bg px-2.5 py-0.5 text-xs font-medium text-success">
                      {d.name}
                    </span>
                  ))}
                </div>
              )}
              <dl className="divide-y divide-border/60 border-t border-border/60">
                <Row label="Prep time">{dish.prepTimeMinutes != null ? `${dish.prepTimeMinutes} min` : "Not stated"}</Row>
                <Row label="Menu section">{dish.section?.name ?? "Unsectioned"}</Row>
                <Row label="Tax category">{dish.taxCategory?.name ?? "Country standard rate"}</Row>
              </dl>
              <p className="text-xs text-muted-foreground">List price before any offer or tax.</p>
            </div>
          </div>

          <div className="space-y-3 border-t border-border/70 pt-4">
            <SectionTitle hint={dish.modifierGroups.length > 0 ? "Priced as a change to the dish" : undefined}>Options</SectionTitle>
            {dish.modifierGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">This dish has no options.</p>
            ) : (
              <ul className="space-y-2">
                {dish.modifierGroups.map((g) => (
                  <li
                    key={g.id}
                    className={`rounded-xl border px-4 py-3 ${g.blocksDish ? "border-destructive/40 bg-destructive/5" : "border-border/70"}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{g.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {g.required ? `choose ${g.minSelect === g.maxSelect ? g.minSelect : `${g.minSelect}–${g.maxSelect}`}` : `optional · up to ${g.maxSelect}`}
                      </span>
                      {g.blocksDish && <span className="badge-danger">unresolved review</span>}
                    </div>
                    {g.description && <p className="mt-1 text-xs text-muted-foreground">{g.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {g.options.map((o) => (
                        <span
                          key={o.id}
                          className={`rounded-md border px-2 py-0.5 text-xs ${o.isAvailable ? "border-border/70 text-foreground" : "border-border/40 text-muted-foreground line-through"}`}
                        >
                          {o.name}
                          {o.priceDeltaMinor !== 0 && (
                            <span className="ml-1 tabular-nums text-muted-foreground">
                              {o.priceDeltaMinor > 0 ? "+" : "−"}{price(Math.abs(o.priceDeltaMinor))}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="border-t border-border/70 pt-3 text-xs text-muted-foreground">
            Content review and dish-wide actions (country and global admins) are on the{" "}
            <Link href={`/meals/dishes/${dish.id}`} className="text-primary hover:underline">dish page</Link>.
          </p>
        </section>

        <div className="space-y-4">
          {/* ── Marketplace state + what I can do ─────────────────── */}
          <section className="admin-card space-y-4">
            <SectionTitle>Marketplace</SectionTitle>

            {listing.dishSellable && outletIssues.length === 0 ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-success/30 bg-success-bg px-3 py-2.5 text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span>
                  Nothing on the listing, its dish or its outlet keeps it off the marketplace.
                  {!listing.isAvailable && " The vendor has it off today, so customers see it greyed out and cannot order it."}
                </span>
              </div>
            ) : (
              <div className="space-y-1.5 rounded-xl border border-warning/30 bg-warning-bg px-3 py-2.5">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CircleAlert className="h-4 w-4 shrink-0 text-warning" />
                  Customers cannot see this listing
                </p>
                <ul className="space-y-0.5 pl-6 text-sm text-foreground">
                  {listing.blockers.map((b) => <li key={b} className="list-disc">{BLOCKER_LABEL[b]}</li>)}
                  {outletIssues.map((i) => <li key={i} className="list-disc">{i} <span className="text-xs text-muted-foreground">(fixed on the outlet)</span></li>)}
                </ul>
              </div>
            )}

            <dl className="divide-y divide-border/60">
              <Row label="Vendor availability"><span className={vendorState.badge}>{vendorState.label}</span></Row>
              <Row label="Visibility">
                {listing.adminHiddenAt ? <>Hidden <span className="text-xs text-muted-foreground">since {when(listing.adminHiddenAt)}</span></> : "Visible"}
              </Row>
              <Row label="Suspension">
                {listing.adminStatus === "SUSPENDED"
                  ? <>Suspended <span className="text-xs text-muted-foreground">since {when(listing.adminSuspendedAt)}</span></>
                  : "None"}
              </Row>
              <Row label="Dish review">{dish.reviewStatus.toLowerCase().replaceAll("_", " ")}</Row>
              <Row label="Dish status">{dish.adminStatus.toLowerCase()}</Row>
            </dl>

            <div className="border-t border-border/70 pt-4">
              {canModerate ? (
                <ListingControls
                  mealId={listing.id}
                  countryId={listing.country.id}
                  canEscalate={listing.escalation.canEscalate}
                  pendingEscalation={listing.escalation.pending}
                  dishName={dish.name}
                  outletName={outlet.name}
                  adminStatus={listing.adminStatus}
                  hidden={!!listing.adminHiddenAt}
                  removed={!!listing.removedAt}
                />
              ) : (
                <p className="text-sm text-muted-foreground">You can view this listing but not change its marketplace state.</p>
              )}
            </div>
          </section>

          {/* ── Escalation ─────────────────────────────────────────── */}
          {esc ? (
            <section className={`admin-card space-y-3 ${esc.status === "PENDING" ? "border-warning/40" : ""}`}>
              <SectionTitle hint={<span className={esc.status === "PENDING" ? "badge-warning" : "badge-neutral"}>{esc.status === "PENDING" ? "Open" : "Resolved"}</span>}>
                <span className="inline-flex items-center gap-1.5"><ArrowUpRight className="h-4 w-4 text-muted-foreground" /> Escalation</span>
              </SectionTitle>
              <p className="whitespace-pre-line text-sm text-foreground">{esc.note}</p>
              <dl className="divide-y divide-border/60">
                <Row label="Raised by">
                  {esc.raisedBy}
                  {esc.cityName && <span className="text-xs text-muted-foreground"> · {esc.cityName}{esc.countryName ? `, ${esc.countryName}` : ""}</span>}
                </Row>
                <Row label="Sent to">{esc.assignedTo}</Row>
                {esc.requestedAction && <Row label="Suggested action">{MEAL_REASON_ACTION_LABEL[esc.requestedAction]}</Row>}
                <Row label="Raised">{when(esc.createdAt)}</Row>
                {esc.status === "RESOLVED" && (
                  <Row label="Resolved">{esc.resolvedBy ?? "—"} <span className="text-xs text-muted-foreground">· {when(esc.resolvedAt)}</span></Row>
                )}
              </dl>
              {esc.resolutionNote && (
                <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-foreground">{esc.resolutionNote}</p>
              )}
              {esc.status === "PENDING" && canModerate && esc.canResolve && (
                <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-3">
                  <span className="text-xs text-muted-foreground">Act on the listing first; resolving changes nothing on it.</span>
                  <EscalationResolveButton id={esc.id} dishName={dish.name} />
                </div>
              )}
            </section>
          ) : (
            <p className="px-1 text-xs text-muted-foreground">No escalation on this listing.</p>
          )}

          {/* ── What happened? ─────────────────────────────────────── */}
          <section className="admin-card space-y-4">
            <SectionTitle>Timeline</SectionTitle>
            <dl className="divide-y divide-border/60">
              <Row label="Listed at this outlet">{when(listing.createdAt)}</Row>
              <Row label="Listing last changed by vendor">{when(listing.vendorUpdatedAt)}</Row>
              <Row label="Dish created">{when(dish.createdAt)}</Row>
              <Row label="Dish last changed by vendor">{when(dish.vendorUpdatedAt)}</Row>
              {listing.removedAt && <Row label="Removed from this outlet">{when(listing.removedAt)}</Row>}
            </dl>

            <div className="space-y-2 border-t border-border/70 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Platform actions</p>
              {listing.controlHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No platform action has been taken on this listing.</p>
              ) : (
                <ol className="space-y-3">
                  {listing.controlHistory.map((h) => (
                    <li key={h.id} className="relative border-l-2 border-border/70 pl-3 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium text-foreground">{CONTROL_ACTION_LABEL[h.action] ?? h.action}</span>
                        <span className="text-xs text-muted-foreground">{when(h.createdAt)}</span>
                      </div>
                      {h.adminName && <p className="text-xs text-muted-foreground">by {h.adminName}</p>}
                      {h.reason.label && (
                        <p className="mt-0.5 text-foreground">
                          {h.reason.label}
                          {h.reason.isOther && <span className="badge-warning ml-1.5">exception</span>}
                        </p>
                      )}
                      {h.reason.vendorMessage && <p className="text-xs text-muted-foreground">Vendor read: {h.reason.vendorMessage}</p>}
                      {h.reason.legacyText && <p className="whitespace-pre-line text-foreground">{h.reason.legacyText}</p>}
                      {h.reason.internalNote && <p className="text-xs text-muted-foreground">Internal note: {h.reason.internalNote}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
