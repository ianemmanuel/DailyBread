import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Flag, Undo2, ImageOff, Store, ExternalLink, Ban, ShieldAlert,
} from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { MealModerationActions } from "@/components/vendors/MealModerationActions"
import { ModifierGroupModerationActions } from "@/components/vendors/ModifierGroupModerationActions"
import { formatMealPrice, type AdminMealDetail } from "@/types"

export const metadata: Metadata = { title: "Meal" }

interface Props { params: Promise<{ itemId: string }> }

const FLAG_FIELD: Record<string, string> = {
  INAPPROPRIATE_NAME       : "the name",
  INAPPROPRIATE_DESCRIPTION: "the description",
  INAPPROPRIATE_PORTION    : "the portion size",
  INAPPROPRIATE_MODIFIER   : "one of the choice groups",
}

/* What screening found in a GROUP — its own reasons, separate from the dish's. */
const GROUP_FLAG_LABEL: Record<string, string> = {
  INAPPROPRIATE_NAME  : "name or description",
  INAPPROPRIATE_OPTION: "option names",
  // A new group (usually a copy) with the exact words of one still held.
  MATCHES_UNRESOLVED_GROUP: "same wording as a group under review or sent back",
}

/* Vendor-facing wording for the send-back message. A vendor told
 * "INAPPROPRIATE_NAME" learns nothing; a vendor told which field to rewrite
 * knows exactly what to do. The moderator edits it before sending. */
function buildSuggestedReason(meal: AdminMealDetail): string {
  if (meal.flagReasons.length === 0) return ""
  return meal.flagReasons
    .map((r) =>
      r === "INAPPROPRIATE_NAME"
        ? "Name: please rewrite this for a general audience — the wording was flagged by our checks."
        : r === "INAPPROPRIATE_DESCRIPTION"
          ? "Description: please rewrite this for a general audience — the wording was flagged by our checks."
          : r === "INAPPROPRIATE_PORTION"
          ? "Portion size: please rewrite this for a general audience — the wording was flagged by our checks."
          : r === "INAPPROPRIATE_MODIFIER"
            // Named by group, because the vendor has to know WHICH one to fix
            // and it may be shared across several of their dishes.
            ? `Choices: please rewrite the wording in ${
                meal.modifierGroups.filter((g) => g.flagged).map((g) => `"${g.name}"`).join(", ") ||
                "one of your choice groups"
              } — it was flagged by our checks.`
            : r,
    )
    .join("\n")
}

/**
 * One dish, and the decision about it.
 *
 * Photo-led, because a meal is judged on what a customer would see and half of
 * that is the image — which is exactly what a table row cannot show, and why
 * moderating from the queue was never the right shape.
 */
export default async function AdminMealDetailPage({ params }: Props) {
  const { itemId } = await params
  const session = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.VENDORS_MEALS_READ)) redirect("/vendors")
  const canModerate = session.permissions.includes(AdminPermissions.VENDORS_MEALS_MODERATE)

  let meal: AdminMealDetail
  try {
    // Uncached: this page is where a moderation decision is made, and it must
    // show the state the decision applies to (the actions send it back as
    // expectedStatus). Images are stable public derivatives either way.
    meal =await adminFetch<AdminMealDetail>(`/admin/v1/vendors/meals/${itemId}`, { cache: "no-store" })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const price = (minor: number) => formatMealPrice(minor, meal.currency)

  return (
    <div className="page-content animate-slide-up">
      <div>
        <Link
          href="/vendors/meals"
          className="group inline-flex w-fit items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card shadow-[var(--shadow-xs)] transition-all group-hover:-translate-x-0.5 group-hover:border-primary/40 group-hover:text-primary">
            <ArrowLeft className="h-4 w-4" />
          </span>
          Back to Meals
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">{meal.name}</h1>
          {meal.isArchived && <span className="badge-neutral">Archived by the vendor</span>}
        </div>
        <p className="text-sm text-muted-foreground">
          Sold by{" "}
          <Link href={`/vendors/accounts/${meal.vendorId}`} className="text-primary hover:underline">
            {meal.vendor.legalBusinessName}
          </Link>
          {meal.section && ` · ${meal.section.name}`}
          {meal.prepTimeMinutes != null && ` · ${meal.prepTimeMinutes} min to prepare`}
          {` · Tax: ${meal.taxCategory?.name ?? "country standard rate"}`}
        </p>
        {meal.isArchived && (
          <p className="mt-1 text-xs text-muted-foreground">
            The vendor has withdrawn this meal everywhere, so no customer sees it whatever the verdict below.
          </p>
        )}
      </div>

      {/* Evidence left, decision right — never a scroll apart. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4">
          <div className="admin-card overflow-hidden p-0">
            <div className="relative aspect-[16/9] w-full bg-muted">
              {meal.mainImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- public derivative
                <img src={meal.mainImageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
                  <ImageOff className="h-5 w-5" />
                  <span className="text-xs">No photo</span>
                </div>
              )}
            </div>

            {meal.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto border-b border-border/70 p-3">
                {meal.images.slice(1).map((img) => (
                  <div key={img.storageKey} className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {img.url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- public derivative
                      <img src={img.url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImageOff className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-display text-lg font-semibold text-foreground">{meal.name}</h2>
                <span className="font-display text-lg font-semibold tabular-nums text-foreground">
                  {price(meal.basePriceMinor)}
                </span>
              </div>

              {meal.description && (
                <p className="whitespace-pre-line break-words text-sm text-foreground">{meal.description}</p>
              )}

              {(meal.cuisines.length > 0 || meal.dietaryTags.length > 0 || meal.portionSize) && (
                <div className="flex flex-wrap gap-1.5">
                  {meal.portionSize && <span className="badge-neutral">{meal.portionSize}</span>}
                  {meal.cuisines.map((c) => <span key={c.id} className="badge-neutral">{c.name}</span>)}
                  {meal.dietaryTags.map((d) => (
                    <span
                      key={d.id}
                      className="rounded-full border border-success/30 bg-success-bg px-2.5 py-0.5 text-xs font-medium text-success"
                    >
                      {d.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {meal.modifierGroups.length > 0 && (
            <div className="admin-card space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">What a customer can choose</h2>
                <span className="text-xs text-muted-foreground">
                  Priced as a change to the dish, not as a price of their own
                </span>
              </div>
              <ul className="space-y-2">
                {meal.modifierGroups.map((g) => (
                  <li
                    key={g.id}
                    className={`rounded-xl border px-4 py-3 ${
                      g.blocksDish ? "border-destructive/40 bg-destructive/5" : "border-border/70"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{g.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {g.required ? "must choose" : "optional"}
                        {g.maxSelect > 1 ? ` · up to ${g.maxSelect}` : " · one"}
                      </span>
                      {g.reviewStatus === "FLAGGED" && (
                        <span className="badge-danger inline-flex items-center gap-1">
                          <ShieldAlert className="h-3 w-3" />
                          flagged{g.flagReasons.length > 0 && ` · ${g.flagReasons.map((r) => GROUP_FLAG_LABEL[r] ?? r).join(", ")}`}
                        </span>
                      )}
                      {g.reviewStatus === "MANUALLY_REJECTED" && (
                        <span className="badge-danger inline-flex items-center gap-1">
                          <Undo2 className="h-3 w-3" />
                          sent back · waiting on the vendor
                        </span>
                      )}
                      {g.reviewStatus === "MANUALLY_APPROVED" && <span className="badge-success">approved</span>}
                      {g.usedByCount > 1 && (
                        <span className="text-xs text-muted-foreground">
                          on {g.usedByCount} dishes
                        </span>
                      )}
                    </div>
                    {g.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{g.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {g.options.map((o) => (
                        <span
                          key={o.id}
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            o.isAvailable
                              ? "border-border/70 text-foreground"
                              : "border-border/40 text-muted-foreground line-through"
                          }`}
                        >
                          {o.name}
                          {o.priceDeltaMinor !== 0 && (
                            <span className="ml-1 tabular-nums text-muted-foreground">
                              {o.priceDeltaMinor > 0 ? "+" : "−"}
                              {price(Math.abs(o.priceDeltaMinor))}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                    {g.rejectionReason && g.reviewStatus === "MANUALLY_REJECTED" && (
                      <p className="mt-2 whitespace-pre-line text-xs text-foreground">
                        <span className="font-medium">Vendor was told:</span> {g.rejectionReason}
                      </p>
                    )}
                    {canModerate && <ModifierGroupModerationActions group={g} />}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="admin-card space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Where it&apos;s sold</h2>
            {meal.outlets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not sold at any location right now, so no customer can see it.
              </p>
            ) : (
              <ul className="space-y-2">
                {meal.outlets.map((o) => (
                  <li
                    key={o.mealId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/outlets/${o.outletId}`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary hover:underline"
                      >
                        <Store className="h-3.5 w-3.5 shrink-0" />
                        {o.outletName}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {o.outletCity ? `${o.outletCity} · ` : ""}{o.outletAddress}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* The outlet's own state, read-only — a dish hidden
                          because of where it is sold is a different problem
                          from one hidden for itself, and is fixed elsewhere. */}
                      {o.outletAdminStatus !== "ACTIVE" && (
                        <span className="badge-danger">outlet {o.outletAdminStatus.toLowerCase().replace("_", " ")}</span>
                      )}
                      {o.outletClearance !== "CLEARED" && (
                        <span className="badge-warning">outlet not cleared</span>
                      )}
                      {(o.outletReviewStatus === "FLAGGED" || o.outletReviewStatus === "MANUALLY_REJECTED") && (
                        <span className="badge-warning">outlet under review</span>
                      )}
                      {o.adminStatus !== "ACTIVE" && (
                        <span className="badge-danger">{o.adminStatus.toLowerCase()} here</span>
                      )}
                      {o.priceMinorOverride != null && (
                        <span className="text-xs tabular-nums text-foreground">
                          {price(o.priceMinorOverride)}
                        </span>
                      )}
                      <span className={o.isAvailable ? "badge-success" : "badge-warning"}>
                        {o.isAvailable ? "Available" : "Off"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="admin-card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Decision</h2>
              <span className={meal.adminStatus === "ACTIVE" ? "badge-success" : "badge-danger"}>
                {meal.adminStatus.toLowerCase()}
              </span>
            </div>
            <MealModerationActions
              meal={meal}
              canModerate={canModerate}
              suggestedReason={buildSuggestedReason(meal)}
            />
          </div>

          {meal.flagReasons.length > 0 && (
            <div className="rounded-2xl border border-warning/30 bg-warning-bg px-5 py-4">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 shrink-0 text-warning" />
                <p className="text-sm font-semibold text-foreground">
                  {meal.flagReasons.length === 1 ? "1 finding" : `${meal.flagReasons.length} findings`}
                </p>
              </div>
              <ul className="mt-2 space-y-1.5">
                {meal.flagReasons.map((r) => (
                  <li key={r} className="flex gap-2 text-sm text-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />
                    <span>Inappropriate content in {FLAG_FIELD[r] ?? r}</span>
                  </li>
                ))}
              </ul>
              {meal.flaggedAt && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Detected {new Date(meal.flaggedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          {meal.rejectionReason && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive-bg px-5 py-4">
              <div className="flex items-center gap-2">
                <Undo2 className="h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm font-semibold text-destructive">What the vendor was told</p>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-foreground">{meal.rejectionReason}</p>
            </div>
          )}

          {meal.adminStatus === "SUSPENDED" && (
            <div className="rounded-2xl border border-warning/30 bg-warning-bg px-5 py-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
                <p className="text-sm font-semibold text-warning">Suspended</p>
              </div>
              <p className="mt-0.5 text-sm text-foreground">
                Off the marketplace at every location. The vendor can still edit it.
              </p>
            </div>
          )}

          {meal.adminStatus === "BANNED" && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive-bg px-5 py-4">
              <div className="flex items-center gap-2">
                <Ban className="h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm font-semibold text-destructive">Banned</p>
              </div>
              <p className="mt-0.5 text-sm text-foreground">
                Removed permanently, and the vendor cannot edit it.
              </p>
            </div>
          )}

          <div className="admin-card space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Vendor</h2>
            <p className="text-sm text-foreground">{meal.vendor.legalBusinessName}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Link
                href={`/vendors/accounts/${meal.vendorId}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                Open the vendor account
                <ExternalLink className="h-3 w-3" />
              </Link>
              <Link
                href={`/vendors/meals?vendor=${meal.vendorId}&vendorName=${encodeURIComponent(meal.vendor.legalBusinessName)}&status=all`}
                className="text-xs font-medium text-primary hover:underline"
              >
                All their meals →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
