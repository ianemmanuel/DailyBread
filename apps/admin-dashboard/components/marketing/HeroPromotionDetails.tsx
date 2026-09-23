import Image from "next/image"
import { Globe2, ImageOff, MapPin, Zap } from "lucide-react"
import type { HeroPromotion } from "@repo/types/admin-app"

/*
 * A read-only view of one promotion, laid out in the order the storefront
 * renders it — eyebrow, headline, lede, button — so an admin can read down the
 * page and see the hero being described. The panel headings say where each
 * value lands, because "Eyebrow" on its own means nothing to somebody who has
 * not seen the component.
 *
 * A Server Component: no state, no interactivity, no JS shipped.
 *
 * TODO (explicit direction, deliberately not built yet): render an actual
 * preview of the hero card here and on the form, using the promotion's own
 * image. Until that exists the field notes are what stop a paragraph being
 * typed into a 40-character button label.
 */

function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

const STATUS_STYLES: Record<HeroPromotion["status"], string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PUBLISHED: "bg-emerald-500/10 text-emerald-600",
  ARCHIVED: "bg-amber-500/10 text-amber-700",
}

const TIER_COPY: Record<HeroPromotion["priorityTier"], string> = {
  STANDARD: "Standard — the most specific promotion wins",
  FEATURED: "Featured campaign — outranks ordinary promotions",
  TAKEOVER: "Platform takeover — outranks everything else",
}

function Field({
  label,
  where,
  children,
}: {
  label: string
  /** Where this value appears in the hero. */
  where: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
      <p className="text-xs text-muted-foreground/80">{where}</p>
    </div>
  )
}

function Empty() {
  return <span className="text-muted-foreground">Not set</span>
}

export function HeroPromotionDetails({ promotion }: { promotion: HeroPromotion }) {
  const reach =
    promotion.scope === "CITY"
      ? (promotion.city?.name ?? "A city")
      : promotion.scope === "COUNTRY"
        ? (promotion.country?.name ?? "A country")
        : "Everywhere"

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {/* ── Copy, in the order it is rendered ──────────────────────────── */}
        <section className="admin-card space-y-4">
          <h2 className="text-sm font-semibold">Copy</h2>

          <Field label="Eyebrow" where="Small line above the headline, with a chef-hat icon.">
            {promotion.eyebrow || <Empty />}
          </Field>

          <Field label="Headline" where="The large serif headline. Shown at display size, so it must be short.">
            <span className="font-medium">{promotion.headline}</span>
          </Field>

          <Field label="Subheadline" where="One or two lines under the headline.">
            {promotion.subheadline || <Empty />}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Button label"
              where="Sits on a card over the photo. A few words — longer text is truncated."
            >
              {promotion.ctaLabel || <Empty />}
            </Field>
            <Field label="Button link" where="Where that card goes. A path inside the storefront.">
              {promotion.ctaHref ? <code className="text-xs">{promotion.ctaHref}</code> : <Empty />}
            </Field>
          </div>
        </section>

        {/* ── Imagery ────────────────────────────────────────────────────── */}
        <section className="admin-card space-y-3">
          <h2 className="text-sm font-semibold">Image</h2>
          {promotion.image?.url ? (
            <div className="flex flex-wrap items-start gap-4">
              <div className="relative size-40 shrink-0 overflow-hidden rounded-xl border border-border">
                <Image
                  src={promotion.image.url}
                  alt={promotion.imageAlt ?? ""}
                  fill
                  sizes="160px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Field label="Description" where="Read aloud by screen readers in place of the photo.">
                  {promotion.imageAlt || <Empty />}
                </Field>
                <p className="text-xs text-muted-foreground">
                  {promotion.image.width} × {promotion.image.height}, served as WebP or AVIF
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImageOff className="size-4" />
              No image yet — this promotion cannot be published without one.
            </div>
          )}
        </section>
      </div>

      {/* ── Placement and scheduling ─────────────────────────────────────── */}
      <aside className="space-y-4">
        <section className="admin-card space-y-3">
          <h2 className="text-sm font-semibold">Status</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[promotion.status]}`}
            >
              {promotion.status.toLowerCase()}
            </span>
            {promotion.priorityTier !== "STANDARD" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary-hover">
                <Zap className="size-3" />
                {promotion.priorityTier.toLowerCase()}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{TIER_COPY[promotion.priorityTier]}</p>
        </section>

        <section className="admin-card space-y-3">
          <h2 className="text-sm font-semibold">Where it applies</h2>
          <p className="flex items-center gap-1.5 text-sm">
            {promotion.scope === "GLOBAL" ? (
              <Globe2 className="size-3.5 text-muted-foreground" />
            ) : (
              <MapPin className="size-3.5 text-muted-foreground" />
            )}
            {reach}
          </p>
          <p className="text-xs text-muted-foreground">
            {promotion.scope === "GLOBAL"
              ? "Seen anywhere nothing more specific outranks it — including by visitors who have not shared a location."
              : "Seen only by visitors resolved to this place."}
          </p>
        </section>

        <section className="admin-card space-y-3">
          <h2 className="text-sm font-semibold">Schedule</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-xs text-muted-foreground">Starts</dt>
              <dd className="text-right">{formatDate(promotion.startsAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-xs text-muted-foreground">Ends</dt>
              <dd className="text-right">
                {promotion.endsAt ? (
                  formatDate(promotion.endsAt)
                ) : (
                  <span className="text-muted-foreground">Runs until withdrawn</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-xs text-muted-foreground">Published</dt>
              <dd className="text-right">{formatDate(promotion.publishedAt)}</dd>
            </div>
          </dl>
        </section>
      </aside>
    </div>
  )
}
