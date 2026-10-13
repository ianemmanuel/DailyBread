import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { UtensilsCrossed, Layers, EyeOff, ShieldAlert, Flag, ArrowUpRight, ArrowRight } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { MEAL_REASON_ACTION_LABEL } from "@repo/types/enums"
import { EscalationResolveButton } from "@/components/meals/EscalationResolveButton"
import type { MealsOverview } from "@/types"

export const metadata: Metadata = { title: "Meals" }

/**
 * The Meals domain's front door: what needs attention in this admin's scope,
 * one click from the filtered list that holds it. Counts come straight from
 * the backend (scoped there); nothing is computed here.
 */
export default async function MealsOverviewPage() {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.VENDORS_MEALS_READ)) redirect("/overview")

  const data = await adminFetch<MealsOverview>("/admin/v1/vendors/meals/overview", { cache: "no-store" }).catch(() => null)

  const tiles = data ? [
    { label: "Current listings", value: data.listings.current,   icon: Layers,      badge: "icon-badge-primary", href: "/meals/listings" },
    { label: "Hidden listings",  value: data.listings.hidden,    icon: EyeOff,      badge: "icon-badge-warning", href: "/meals/listings?control=hidden" },
    { label: "Suspended listings", value: data.listings.suspended, icon: ShieldAlert, badge: "icon-badge-danger", href: "/meals/listings?control=suspended" },
    { label: "Flagged dishes",   value: data.dishes.flagged,     icon: Flag,        badge: "icon-badge-warning", href: "/meals/dishes?status=FLAGGED" },
    { label: "Open escalations", value: data.escalations.pending, icon: ArrowUpRight, badge: "icon-badge-primary", href: "#escalations" },
  ] : []

  return (
    <div className="page-content animate-slide-up">
      <div className="flex items-center gap-3">
        <div className="icon-badge icon-badge-primary h-10 w-10">
          <UtensilsCrossed className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Meals</h1>
          <p className="text-sm text-muted-foreground">
            A <span className="font-medium text-foreground">dish</span> is a vendor&apos;s reusable definition; a{" "}
            <span className="font-medium text-foreground">listing</span> is one dish sold at one outlet. Everyday
            governance happens on listings.
          </p>
        </div>
      </div>

      {!data ? (
        <div className="admin-card text-sm text-destructive">
          Couldn&apos;t load the overview. Reload the page, or check that your account still has access to Meals.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {tiles.map(({ label, value, icon: Icon, badge, href }) => (
              <Link key={label} href={href} className="stat-card transition-colors hover:border-primary/40">
                <div className={`icon-badge h-12 w-12 ${badge}`}><Icon className="h-5 w-5" /></div>
                <div>
                  <p className="stat-card-value">{value}</p>
                  <p className="stat-card-label">{label}</p>
                </div>
              </Link>
            ))}
          </div>

          <div id="escalations" className="admin-card space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Open escalations</h2>
              <span className="text-xs text-muted-foreground">
                City admins escalate a listing when no standard reason fits
              </span>
            </div>
            {data.escalations.latest.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing escalated in your area.</p>
            ) : (
              <ul className="space-y-2">
                {data.escalations.latest.map((e) => (
                  <li key={e.id} className="rounded-xl border border-border/70 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-medium text-foreground">
                          {e.dishName} <span className="text-muted-foreground">— {e.outletName}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          From {e.createdBy.firstName} {e.createdBy.lastName} to {e.assignedTo.firstName}{" "}
                          {e.assignedTo.lastName} · {new Date(e.createdAt).toLocaleString()}
                          {e.requestedAction && ` · suggests: ${MEAL_REASON_ACTION_LABEL[e.requestedAction]}`}
                        </p>
                        <p className="whitespace-pre-line pt-1 text-sm text-foreground">{e.note}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Link
                          href={`/meals/listings/${e.mealId}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          View listing <ArrowRight className="h-3 w-3" />
                        </Link>
                        {e.canResolve && <EscalationResolveButton id={e.id} dishName={e.dishName} />}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data.escalations.pending > data.escalations.latest.length && (
              <p className="text-xs text-muted-foreground">
                Showing the latest {data.escalations.latest.length} of {data.escalations.pending}.
              </p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {[
              { href: "/meals/listings", title: "Listings", body: "Every dish at every outlet in your area. Hide or suspend one outlet's listing." },
              { href: "/meals/dishes", title: "Dishes", body: data.canActDishWide
                ? "Vendors' reusable dishes. Content review and dish-wide actions, at every outlet."
                : "Vendors' reusable dishes sold in your city. Dish-wide actions are for country admins." },
              { href: "/meals/reasons", title: "Action Reasons", body: "The predefined reasons every consequential action is backed by." },
            ].map((c) => (
              <Link key={c.href} href={c.href} className="admin-card space-y-1 transition-colors hover:border-primary/40">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">{c.title} <ArrowRight className="h-3.5 w-3.5" /></p>
                <p className="text-xs text-muted-foreground">{c.body}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
