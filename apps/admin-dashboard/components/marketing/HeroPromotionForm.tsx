"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { HeroPromotion, HeroPromotionScope } from "@repo/types/admin-app"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { HeroImageField } from "./HeroImageField"

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
 * caller does not hold, so this form guides rather than gates.
 */

interface PlaceOption {
  id: string
  name: string
  slug: string
}

export function HeroPromotionForm({
  promotion,
  countries,
  cities,
}: {
  promotion?: HeroPromotion
  countries: PlaceOption[]
  cities: PlaceOption[]
}) {
  const router = useRouter()
  const editing = Boolean(promotion)

  const [saving, setSaving] = useState(false)
  const [scope, setScope] = useState<HeroPromotionScope>(promotion?.scope ?? "GLOBAL")
  const [countryRef, setCountryRef] = useState(promotion?.country?.slug ?? "")
  const [cityRef, setCityRef] = useState(promotion?.city?.slug ?? "")
  const [originalImageKey, setOriginalImageKey] = useState<string | null>(null)
  const [imageCleared, setImageCleared] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const text = (name: string) => (form.get(name) as string | null)?.trim() || null

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
      priority: Number(form.get("priority") ?? 0),
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
      router.push("/marketing")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the promotion")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="admin-card space-y-4">
        <h2 className="text-sm font-semibold">Where it applies</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="scope">Reach</Label>
            <select
              id="scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as HeroPromotionScope)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="GLOBAL">Global — everyone, unless something more specific exists</option>
              <option value="COUNTRY">Country — every city in one country</option>
              <option value="CITY">City — one city only</option>
            </select>
          </div>

          {scope === "COUNTRY" && (
            <div className="space-y-1.5">
              <Label htmlFor="countryRef">Country</Label>
              <select
                id="countryRef"
                value={countryRef}
                onChange={(e) => setCountryRef(e.target.value)}
                required
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Choose a country…</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {scope === "CITY" && (
            <div className="space-y-1.5">
              <Label htmlFor="cityRef">City</Label>
              <select
                id="cityRef"
                value={cityRef}
                onChange={(e) => setCityRef(e.target.value)}
                required
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Choose a city…</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          A visitor sees the most specific promotion that applies to them: their
          city first, then their country, then the global default.
        </p>
      </section>

      <section className="admin-card space-y-4">
        <h2 className="text-sm font-semibold">Image</h2>
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
        <h2 className="text-sm font-semibold">Copy</h2>

        <div className="space-y-1.5">
          <Label htmlFor="eyebrow">Eyebrow</Label>
          <Input
            id="eyebrow"
            name="eyebrow"
            defaultValue={promotion?.eyebrow ?? ""}
            maxLength={60}
            placeholder="Good food, made simple"
          />
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
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="subheadline">Subheadline</Label>
          <Textarea
            id="subheadline"
            name="subheadline"
            rows={2}
            maxLength={240}
            defaultValue={promotion?.subheadline ?? ""}
          />
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

        <div className="space-y-1.5 sm:max-w-40">
          <Label htmlFor="priority">Priority</Label>
          <Input
            id="priority"
            name="priority"
            type="number"
            min={0}
            max={1000}
            defaultValue={promotion?.priority ?? 0}
          />
          <p className="text-xs text-muted-foreground">
            Breaks ties between promotions of the same reach. Higher wins.
          </p>
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
