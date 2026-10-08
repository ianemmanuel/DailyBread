import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Globe2, MapPin, MessageSquareQuote, ArrowRight } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { MEAL_REASON_ACTION_LABEL, MealReasonActions, type MealReasonAction } from "@repo/types/enums"
import { ReasonForm } from "@/components/meals/ReasonForm"
import type { MealReasonDetail } from "@/types"

export const metadata: Metadata = { title: "Action Reason" }

const LISTING_ACTIONS: MealReasonAction[] = [MealReasonActions.LISTING_HIDE, MealReasonActions.LISTING_SUSPEND]

/**
 * One Action Reason: what admins pick, what the vendor reads, which actions
 * it can justify, and how it relates to its platform reason or country
 * versions. Editing is the same sheet the list uses; the system identifier is
 * shown last, read-only.
 */
export default async function ActionReasonDetailPage({ params }: { params: Promise<{ reasonId: string }> }) {
  const { reasonId } = await params
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.VENDORS_MEALS_READ)) redirect("/overview")

  let reason: MealReasonDetail
  try {
    reason = await adminFetch<MealReasonDetail>(`/admin/v1/vendors/meals/reasons/library/${reasonId}`, { cache: "no-store" })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const listing = reason.appliesTo.filter((a) => LISTING_ACTIONS.includes(a))
  const dish    = reason.appliesTo.filter((a) => !LISTING_ACTIONS.includes(a))

  return (
    <div className="page-content animate-slide-up">
      <div>
        <Link
          href="/meals/reasons"
          className="group inline-flex w-fit items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card shadow-[var(--shadow-xs)] transition-all group-hover:-translate-x-0.5 group-hover:border-primary/40 group-hover:text-primary">
            <ArrowLeft className="h-4 w-4" />
          </span>
          Back to action reasons
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Action reason</p>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {reason.label}
              {!reason.isActive && <span className="badge-neutral ml-2 align-middle text-xs font-normal">Inactive</span>}
            </h1>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              {reason.countryName ? <MapPin className="h-3.5 w-3.5" /> : <Globe2 className="h-3.5 w-3.5" />}
              {reason.countryName
                ? reason.replacesPlatformId
                  ? `Country version — replaces the platform reason in ${reason.countryName}`
                  : `${reason.countryName} only`
                : "Available platform-wide"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {reason.canAddCountryVersion && reason.canCreateCountry && (
              <ReasonForm mode="override" base={reason} countryId={reason.canCreateCountry.id} countryName={reason.canCreateCountry.name} />
            )}
            {reason.canManage && <ReasonForm mode="edit" reason={reason} />}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4">
          <section className="admin-card space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessageSquareQuote className="h-4 w-4 text-muted-foreground" />
              What the vendor reads
            </h2>
            {reason.vendorMessage ? (
              <blockquote className="rounded-xl border-l-2 border-primary/50 bg-muted/30 px-4 py-3 text-sm leading-relaxed text-foreground">
                {reason.vendorMessage}
              </blockquote>
            ) : (
              <p className="text-sm text-destructive">No explanation is set, so this reason cannot be used until one is added.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Used exactly as written whenever an admin chooses this reason. Admins cannot reword it per action.
            </p>
          </section>

          <section className="admin-card space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Can justify</h2>
            {reason.appliesTo.length === 0 ? (
              <p className="text-sm text-muted-foreground">No meal actions — it is not offered anywhere in Meals.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { title: "One listing", items: listing },
                  { title: "The whole dish", items: dish },
                ].map((g) => (
                  <div key={g.title} className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.title}</p>
                    {g.items.length === 0 ? (
                      <p className="text-xs text-muted-foreground">—</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {g.items.map((a) => (
                          <span key={a} className="rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground">
                            {MEAL_REASON_ACTION_LABEL[a]}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="admin-card space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Versions</h2>
            {reason.platform ? (
              <div className="space-y-2">
                <p className="text-sm text-foreground">
                  Replaces this platform reason in {reason.countryName}:
                </p>
                <Link
                  href={`/meals/reasons/${reason.platform.id}`}
                  className="block rounded-xl border border-border/70 px-3 py-2.5 transition-colors hover:border-primary/40"
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">
                    {reason.platform.label} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  {reason.platform.vendorMessage && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{reason.platform.vendorMessage}</span>
                  )}
                </Link>
              </div>
            ) : reason.countryId ? (
              <p className="text-sm text-muted-foreground">A reason of {reason.countryName}&apos;s own; there is no platform version.</p>
            ) : reason.countryVersions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Every country uses this platform wording.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-foreground">These countries use their own version:</p>
                <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
                  {reason.countryVersions.map((v) => (
                    <li key={v.id}>
                      <Link href={`/meals/reasons/${v.id}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/40">
                        <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />{v.countryName}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="admin-card space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Technical</h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">System identifier</dt>
                <dd className="font-mono text-xs text-foreground">{reason.code}</dd>
                <dd className="text-xs text-muted-foreground">Generated when the reason was created; never changes.</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Created</dt>
                <dd className="text-foreground">{new Date(reason.createdAt).toLocaleDateString()}</dd>
              </div>
              {reason.otherUses.length > 0 && (
                <div>
                  <dt className="text-xs text-muted-foreground">Also used outside Meals</dt>
                  <dd className="text-xs text-foreground">{reason.otherUses.length} other {reason.otherUses.length === 1 ? "action" : "actions"}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}
