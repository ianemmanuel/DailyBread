"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import type {
  HeroPromotion,
  HeroPromotionPriorityTier,
  HeroPromotionScope,
} from "@repo/types/admin-app"
import { HERO_PRIORITY_TIERS, tierRequiresEndDate } from "@repo/types/admin-app"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import Link from "next/link"
import type { ScopeTier } from "@/lib/auth/scope-tier"
import { HeroImageField } from "./HeroImageField"
import {
  HeroPromotionPlacement,
  defaultReachFor,
  type PlaceOption,
} from "./HeroPromotionPlacement"

/*
 * Create and edit a storefront hero promotion.
 *
 * Only the fields an admin actually authors are here. `status`, `publishedAt`
 * and everything derived from the image are absent because the server owns
 * them — publishing is its own action behind its own permission, and the
 * image's key and dimensions come from the file the server processed.
 *
 * Scope is chosen as a REACH plus a place, mirroring the backend: a global
 * promotion names nowhere, a country one names a country, a city one names a
 * city. The backend refuses any other combination, and refuses a reach the
 * caller does not hold, so this form guides rather than gates — see
 * HeroPromotionPlacement for which reaches a tier may author and why.
 */

const TIER_COPY: Record<
  HeroPromotionPriorityTier,
  { label: string; hint: string }
> = {
  STANDARD: {
    label: "Standard",
    hint: "The ordinary hero. A city promotion beats its country's, which beats the global default.",
  },
  FEATURED: {
    label: "Featured campaign",
    hint: "Outranks ordinary promotions wherever it applies — so a national campaign reaches every city without being re-uploaded.",
  },
  TAKEOVER: {
    label: "Platform takeover",
    hint: "Outranks everything that is not also a takeover. For anniversaries and launches.",
  },
}

/**
 * A Date/ISO string as `<input type="datetime-local">` wants it.
 *
 * That input has no timezone: it shows and returns the BROWSER's local time.
 * Converting through the local offset rather than slicing `toISOString()` is
 * what makes the field show the admin the time they actually chose — slicing
 * the UTC string shows a Nairobi admin a value three hours off their own
 * clock, which reads as a bug every time.
 */
function toLocalInput(value: string | Date | null | undefined): string {
  if (!value) return ""
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ""
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

/** Back to an absolute instant. `new Date("...")` on a datetime-local value
 *  interprets it in the browser's zone, which is exactly what was shown. */
function fromLocalInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function HeroPromotionForm({
  promotion,
  countries,
  tier,
}: {
  promotion?: HeroPromotion
  /** Every country this admin may aim a promotion at — already scope-filtered
   *  by the backend, so its length IS the "one market or many" question. */
  countries: PlaceOption[]
  tier: ScopeTier
}) {
  const router = useRouter()
  const editing = Boolean(promotion)

  const [saving, setSaving] = useState(false)
  const [scope, setScope] = useState<HeroPromotionScope>(
    promotion?.scope ?? defaultReachFor(tier),
  )
  /* A CITY promotion stores its country too, so editing one arrives with the
   * country already known and its city list loads without a second choice. */
  const [countryRef, setCountryRef] = useState(promotion?.country?.slug ?? "")
  const [cityRef, setCityRef] = useState(promotion?.city?.slug ?? "")
  const [originalImageKey, setOriginalImageKey] = useState<string | null>(null)
  const [imageCleared, setImageCleared] = useState(false)
  const [priorityTier, setPriorityTier] = useState<HeroPromotionPriorityTier>(
    promotion?.priorityTier ?? "STANDARD",
  )
  const [endsAt, setEndsAt] = useState(toLocalInput(promotion?.endsAt))
  const [startsAt, setStartsAt] = useState(toLocalInput(promotion?.startsAt))

  /* Drives the end-date field's `required` and its explanation. Mirrors the
   * server's assertPriorityWindow so the admin is told BEFORE submitting; the
   * server is still the one that decides. */
  const needsEndDate = tierRequiresEndDate(priorityTier)

  /*
   * Every promotion is VISIBLE to every marketing admin — seeing what other
   * markets are running is part of the job — but most are not theirs to write.
   *
   * `canManage` is computed by the SERVER, by running the very guard that
   * would refuse the write. The browser deliberately does not re-derive it
   * from scope rules: a second implementation of an authorization rule always
   * drifts, and the failure here would be a form that 403s on save, or one
   * that hides an action the server would have allowed.
   *
   * Rendering the form anyway would also lie — the reach dropdown has no
   * option for a scope this tier cannot author, and a <select> with no
   * matching option silently shows its first one, so the promotion would look
   * re-aimed just from being opened.
   */
  const readOnly = editing && !promotion!.canManage

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const text = (name: string) => (form.get(name) as string | null)?.trim() || null

    /* The place pickers are comboboxes, not `required` selects, so the browser
     * has nothing to block on. Checked here so an admin is told which field is
     * missing instead of reading a 400 out of a toast. The server refuses the
     * same combinations regardless — this is the preview, not the authority. */
    if (scope === "COUNTRY" && !countryRef) {
      toast.error("Choose the country this promotion applies to")
      return
    }
    if (scope === "CITY" && !cityRef) {
      toast.error("Choose the city this promotion applies to")
      return
    }
    /* The Christmas-runs-until-May guard, mirrored from the server. A campaign
     * outranks every ordinary promotion until it stops, so it has to stop. */
    if (needsEndDate && !endsAt) {
      toast.error("A campaign needs an end date — it outranks other promotions until it stops")
      return
    }

    /* Mapped field by field, never a spread of the form data — the same rule
     * the backend controllers follow, for the same reason. */
    const payload: Record<string, unknown> = {
      scope,
      cityRef: scope === "CITY" ? cityRef || null : null,
      countryRef: scope === "COUNTRY" ? countryRef || null : null,
      eyebrow: text("eyebrow"),
      headline: text("headline"),
      subheadline: text("subheadline"),
      ctaLabel: text("ctaLabel"),
      ctaHref: text("ctaHref"),
      imageAlt: text("imageAlt"),
      priorityTier,
      startsAt: fromLocalInput(startsAt),
      endsAt: fromLocalInput(endsAt),
    }
    if (originalImageKey) payload.originalImageKey = originalImageKey

    setSaving(true)
    try {
      const res = await fetch(
        editing
          ? `/api/marketing/hero-promotions/${promotion!.id}`
          : "/api/marketing/hero-promotions",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      )
      const body = await res.json()
      if (!res.ok) throw new Error(body?.message ?? "Could not save the promotion")

      toast.success(editing ? "Promotion saved" : "Promotion created")
      /* Land on the promotion itself, not back in the list. After creating one
       * the next step is almost always to publish it, and the details page is
       * where that button lives — which is also the fix for "it is easy to
       * create a promotion and forget about it". */
      const id = editing ? promotion!.id : body?.data?.id ?? body?.id
      router.push(id ? `/marketing/${id}` : "/marketing")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the promotion")
    } finally {
      setSaving(false)
    }
  }

  if (readOnly) {
    return (
      <div className="admin-card space-y-3">
        <h2 className="text-sm font-semibold">This promotion is above your reach</h2>
        <p className="text-sm text-muted-foreground">
          {promotion!.scope === "GLOBAL"
            ? "Global promotions speak for DailyBread in every market, so only a globally-scoped admin can change them. You can see it here because it is what your market falls back to when nothing more specific is scheduled."
            : "This promotion covers a wider area than your scope, so only an admin responsible for that area can change it."}
        </p>
        <Link href="/marketing" className="text-sm underline underline-offset-4">
          Back to promotions
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <HeroPromotionPlacement
        tier={tier}
        countries={countries}
        scope={scope}
        onScopeChange={setScope}
        countryRef={countryRef}
        onCountryChange={setCountryRef}
        cityRef={cityRef}
        onCityChange={setCityRef}
      />

      <section className="admin-card space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Image</h2>
          <p className="text-xs text-muted-foreground">
            A <strong>square</strong> photograph, at least 900px and ideally
            1600 × 1600. JPEG, PNG, WebP or AVIF; the server re-encodes it, so
            upload the best version you have. Keep the subject centred and out
            of the bottom-left corner — the button card sits there.
          </p>
        </div>
        <HeroImageField
          currentUrl={imageCleared ? null : (promotion?.image?.url ?? null)}
          onUploaded={(key) => {
            setOriginalImageKey(key)
            setImageCleared(false)
          }}
          onCleared={() => {
            setOriginalImageKey(null)
            setImageCleared(true)
          }}
        />
        <div className="space-y-1.5">
          <Label htmlFor="imageAlt">Image description</Label>
          <Input
            id="imageAlt"
            name="imageAlt"
            defaultValue={promotion?.imageAlt ?? ""}
            maxLength={200}
            placeholder="What the photo shows, for screen readers"
          />
        </div>
      </section>

      <section className="admin-card space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Copy</h2>
          {/* Every field below says where it lands and roughly how much room it
              has. Without that, the only feedback on a 200-word button label is
              the silent truncation a customer sees. A live preview of the hero
              card belongs here and is the planned next step. */}
          <p className="text-xs text-muted-foreground">
            Listed in the order they appear in the hero, top to bottom. Only the
            headline is required — anything left blank is simply not rendered.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="eyebrow">Eyebrow</Label>
          <Input
            id="eyebrow"
            name="eyebrow"
            defaultValue={promotion?.eyebrow ?? ""}
            maxLength={60}
            placeholder="Good food, made simple"
          />
          <p className="text-xs text-muted-foreground">
            A small line above the headline, next to a chef-hat icon. Up to 60
            characters.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="headline">Headline *</Label>
          <Input
            id="headline"
            name="headline"
            required
            maxLength={120}
            defaultValue={promotion?.headline ?? ""}
            placeholder="Good food, right when you want it"
          />
          <p className="text-xs text-muted-foreground">
            The large serif headline. Rendered at display size, so a handful of
            words reads best — a long sentence will wrap over several lines and
            push the rest of the hero down the page.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="subheadline">Subheadline</Label>
          <Textarea
            id="subheadline"
            name="subheadline"
            rows={2}
            maxLength={240}
            defaultValue={promotion?.subheadline ?? ""}
            placeholder="Discover meals from great local kitchens, delivered fresh to your door."
          />
          <p className="text-xs text-muted-foreground">
            One or two lines under the headline. Up to 240 characters.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ctaLabel">Button label</Label>
            <Input
              id="ctaLabel"
              name="ctaLabel"
              maxLength={40}
              defaultValue={promotion?.ctaLabel ?? ""}
              placeholder="Explore meal plans"
            />
            <p className="text-xs text-muted-foreground">
              Goes on a small card floating over the photo — <strong>a few
              words, not a sentence</strong>. It is one line and anything longer
              than about 40 characters is cut off with an ellipsis.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ctaHref">Button link</Label>
            <Input
              id="ctaHref"
              name="ctaHref"
              maxLength={300}
              pattern="^/.*"
              defaultValue={promotion?.ctaHref ?? ""}
              placeholder="/meal-plans"
            />
            {/* Refused server-side too. A promotion is platform-authored, and
                an off-site link in it would be an open redirect in our own
                branding. */}
            <p className="text-xs text-muted-foreground">
              A path inside the storefront, e.g. <code>/meal-plans</code>.
            </p>
          </div>
        </div>

      </section>

      {/* SCHEDULING — the tier and the run window belong together, because the
          tier is what makes the end date compulsory. */}
      <section className="admin-card space-y-4">
        <h2 className="text-sm font-semibold">Ranking and schedule</h2>

        <div className="space-y-1.5 sm:max-w-sm">
          <Label htmlFor="priorityTier">Ranking</Label>
          <select
            id="priorityTier"
            value={priorityTier}
            onChange={(e) => setPriorityTier(e.target.value as HeroPromotionPriorityTier)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {HERO_PRIORITY_TIERS.map((value) => (
              <option key={value} value={value}>
                {TIER_COPY[value].label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{TIER_COPY[priorityTier].hint}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="startsAt">Starts</Label>
            <Input
              id="startsAt"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to go live as soon as it is published.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="endsAt">
              Ends {needsEndDate && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id="endsAt"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              required={needsEndDate}
              aria-describedby="endsAt-hint"
            />
            <p
              id="endsAt-hint"
              className={
                needsEndDate ? "text-xs text-foreground" : "text-xs text-muted-foreground"
              }
            >
              {needsEndDate
                ? "Required. A campaign outranks every ordinary promotion until it stops — without an end date, a Christmas hero is still running in May."
                : "Leave empty to run until it is replaced or withdrawn."}
            </p>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {editing ? "Save changes" : "Create draft"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/marketing")}>
          Cancel
        </Button>
      </div>

      {!editing && (
        <p className="text-xs text-muted-foreground">
          New promotions start as a draft. Publishing is a separate step.
        </p>
      )}
    </form>
  )
}
