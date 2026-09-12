"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Loader2, Save, UtensilsCrossed, ImageIcon, Tag, MapPin, Plus, Check, CircleDollarSign,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { FormSection, FormField } from "@/components/dashboard/form"
import { TagMultiSelect } from "@/components/profile/TagMultiSelect"
import { MealImageGallery, type MealImageValue } from "./MealImageGallery"
import { MealModifierSection } from "./MealModifierSection"
import { validateMeal, MEAL_LIMITS, type MealFormValues } from "@/lib/validations/meal"
import { toMinorUnits, fromMinorUnits, formatPrice, type MenuCurrency } from "@/lib/menu/money"
import { releasePreview } from "@/lib/menu/media"
import { ClientApiError } from "@/lib/api/client"
import {
  useMenuContext, useCreateMenuItem, useUpdateMenuItem, useCreateMenuSection,
  type MenuItem,
  type MenuTaxContext,
} from "@/lib/queries/menu"

/*
 * Create or edit one dish.
 *
 * The shape follows the profile form deliberately — same section cards, same
 * required-asterisk rule, same upload contract — so a vendor never meets two
 * different ways of filling something in.
 *
 * Two things here are specific to menus and worth not re-deriving:
 *
 * 1. PRICE IS TYPED IN MAJOR UNITS AND SUBMITTED IN MINOR UNITS. The scale
 *    comes from the vendor's own country currency and is never assumed to be
 *    2 — UGX has none, KWD has three. This is the only place in the stack
 *    where a price is a decimal at all.
 *
 * 2. A DISH IS AUTHORED ONCE AND SOLD AT CHOSEN OUTLETS. A single-location
 *    vendor never sees that control, because it would be a choice with one
 *    option; a multi-location vendor picks, and can set a local price per
 *    location without duplicating the dish.
 */

interface Props {
  /** Absent for create; the existing dish for edit. */
  item?: MenuItem
}

const EMPTY: MealFormValues = {
  name: "", description: "", portionSize: "", prepTime: "", price: "",
  sectionId: "", cuisineIds: [], dietaryTagIds: [], outletIds: [], imageKeys: [],
}

export function MealForm({ item }: Props) {
  const router = useRouter()
  const { data: context, isLoading } = useMenuContext()
  const createItem  = useCreateMenuItem()
  const updateItem  = useUpdateMenuItem(item?.id ?? "")
  const createSection = useCreateMenuSection()

  const [values, setValues] = React.useState<MealFormValues>(EMPTY)
  const [images, setImages] = React.useState<MealImageValue[]>([])
  /** Per-outlet local prices, keyed by outlet id, in major units as typed. */
  const [overrides, setOverrides] = React.useState<Record<string, string>>({})
  /* Attached option groups, in the vendor's display order. Held outside
   * `values` because there is nothing to validate on this side — an id is
   * either one of the vendor's own groups or the backend refuses it. */
  const [modifierGroupIds, setModifierGroupIds] = React.useState<string[]>([])
  const [errors, setErrors] = React.useState<Partial<Record<keyof MealFormValues, string>>>({})
  const [newSection, setNewSection] = React.useState("")
  const [addingSection, setAddingSection] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const currency = context?.currency
  const isEdit   = !!item

  /* Seed from the existing dish, and pre-select the only outlet on create so a
   * single-location vendor is never asked a question with one answer. */
  const seeded = React.useRef(false)
  React.useEffect(() => {
    if (seeded.current || !context) return
    seeded.current = true

    if (item && currency) {
      setValues({
        name         : item.name,
        description  : item.description ?? "",
        portionSize  : item.portionSize ?? "",
        prepTime     : item.prepTimeMinutes != null ? String(item.prepTimeMinutes) : "",
        price        : fromMinorUnits(item.basePriceMinor, currency),
        sectionId    : item.section?.id ?? "",
        cuisineIds   : item.cuisines.map((c) => c.id),
        dietaryTagIds: item.dietaryTags.map((d) => d.id),
        outletIds    : item.outlets.map((o) => o.outletId),
        imageKeys    : item.images.map((i) => i.storageKey),
      })
      setModifierGroupIds([...item.modifierGroups].sort((a, b) => a.position - b.position).map((g) => g.id))
      setImages(item.images.map((i) => ({ storageKey: i.storageKey, url: i.url, isLocal: false })))
      setOverrides(
        Object.fromEntries(
          item.outlets
            .filter((o) => o.priceMinorOverride != null)
            .map((o) => [o.outletId, fromMinorUnits(o.priceMinorOverride!, currency)]),
        ),
      )
      return
    }

    if (context.outlets.length === 1) {
      setValues((prev) => ({ ...prev, outletIds: [context.outlets[0]!.id] }))
    }
  }, [context, item, currency])

  /* Local previews are object URLs; free them when the form goes away. */
  React.useEffect(() => () => {
    images.forEach((i) => { if (i.isLocal) releasePreview(i.url) })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, [])

  function set<K extends keyof MealFormValues>(field: K, value: MealFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }))
    // Clear a field's error the moment it is touched — a message that outlives
    // the problem trains a vendor to ignore messages.
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))
  }

  function updateImages(next: MealImageValue[]) {
    setImages(next)
    set("imageKeys", next.map((i) => i.storageKey))
  }

  async function addSection() {
    const name = newSection.trim()
    if (!name) return
    try {
      const section = await createSection.mutateAsync(name)
      set("sectionId", section.id)
      setNewSection("")
      setAddingSection(false)
      toast.success(`Added the ${section.name} section`)
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Couldn't add that section")
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!currency) return

    const found = validateMeal(values)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      toast.error("Check the highlighted fields")
      return
    }

    const basePriceMinor = toMinorUnits(values.price, currency)
    if (basePriceMinor == null || basePriceMinor <= 0) {
      setErrors({ price: "Enter a price like 1250.00" })
      return
    }

    // Only outlets that are actually selected get an override; a stale entry
    // for an outlet the vendor just unticked must not be sent.
    const priceOverrides: Record<string, number | null> = {}
    for (const outletId of values.outletIds) {
      const raw = overrides[outletId]?.trim()
      priceOverrides[outletId] = raw ? toMinorUnits(raw, currency) : null
    }

    const body = {
      name          : values.name.trim(),
      description   : values.description?.trim() || null,
      portionSize   : values.portionSize?.trim() || null,
      // Empty stays null rather than becoming 0 — "hasn't said" is its own
      // answer, and the backend refuses a zero for the same reason.
      prepTimeMinutes: values.prepTime?.trim() ? Number(values.prepTime) : null,
      basePriceMinor,
      sectionId     : values.sectionId || null,
      // Empty means "the country's default rate", which is a real answer.
      imageKeys     : values.imageKeys,
      cuisineIds    : values.cuisineIds,
      dietaryTagIds : values.dietaryTagIds,
      outletIds     : values.outletIds,
      priceOverrides,
      modifierGroupIds,
    }

    setSaving(true)
    try {
      if (isEdit) {
        await updateItem.mutateAsync(body)
        toast.success("Meal updated")
      } else {
        await createItem.mutateAsync(body)
        toast.success("Meal added to your menu")
      }
      router.push("/meals")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Couldn't save the meal")
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || !context || !currency) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 w-full rounded-2xl" />)}
      </div>
    )
  }

  if (context.outlets.length === 0) {
    return (
      <div className="dash-card p-8 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/10">
          <MapPin className="size-4 text-[var(--primary)]" />
        </div>
        <h2 className="mt-3 text-sm font-semibold text-[var(--foreground)]">Add a location first</h2>
        <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--muted-foreground)]">
          A meal has to be sold somewhere, so your menu starts once you have at least one location.
        </p>
        <Button className="mt-4 rounded-full" onClick={() => router.push("/outlets/create")}>
          Add a location
        </Button>
      </div>
    )
  }

  const multiOutlet   = context.outlets.length > 1
  const previewPrice  = toMinorUnits(values.price, currency)

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <FormSection
            icon={UtensilsCrossed}
            title="The dish"
            description="What customers see first. Keep the name to what it is, not how it's cooked."
          >
            <FormField
              label="Name"
              required
              counter={`${values.name.length}/${MEAL_LIMITS.name}`}
              error={errors.name}
              hint="For example, Nyama Choma or Chicken Biryani."
            >
              <Input
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                maxLength={MEAL_LIMITS.name}
                placeholder="Chicken Biryani"
              />
            </FormField>

            <FormField
              label="Description"
              counter={`${(values.description ?? "").length}/${MEAL_LIMITS.description}`}
              error={errors.description}
              hint="What's in it, and what makes it worth ordering."
            >
              <Textarea
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                maxLength={MEAL_LIMITS.description}
                className="min-h-24"
                placeholder="Slow-cooked basmati with marinated chicken, served with kachumbari."
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Portion size"
                error={errors.portionSize}
                hint="Optional, e.g. Serves 1 or 500g."
              >
                <Input
                  value={values.portionSize}
                  onChange={(e) => set("portionSize", e.target.value)}
                  maxLength={MEAL_LIMITS.portionSize}
                  placeholder="Serves 1"
                />
              </FormField>

              <FormField label="Menu section" hint="Groups this dish on your menu.">
                {addingSection ? (
                  <div className="flex gap-1.5">
                    <Input
                      value={newSection}
                      onChange={(e) => setNewSection(e.target.value)}
                      placeholder="Starters"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); void addSection() }
                        if (e.key === "Escape") { setAddingSection(false); setNewSection("") }
                      }}
                    />
                    <Button
                      type="button"
                      size="icon"
                      className="shrink-0"
                      disabled={createSection.isPending || !newSection.trim()}
                      onClick={addSection}
                      aria-label="Save section"
                    >
                      {createSection.isPending
                        ? <Loader2 className="size-4 animate-spin" />
                        : <Check className="size-4" />}
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <Select
                      value={values.sectionId || "none"}
                      onValueChange={(v) => set("sectionId", v === "none" ? "" : v)}
                    >
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No section</SelectItem>
                        {context.sections.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={() => setAddingSection(true)}
                      aria-label="Add a section"
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                )}
              </FormField>
            </div>
          </FormSection>

          <FormSection
            icon={CircleDollarSign}
            title="Price"
            description={`Set in ${currency.code}. This is what a customer pays before any delivery fee.`}
          >
            <FormField label="Price" required error={errors.price}>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-[var(--muted-foreground)]">
                  {currency.symbol}
                </span>
                <Input
                  value={values.price}
                  onChange={(e) => set("price", e.target.value)}
                  inputMode="decimal"
                  className="pl-10 text-base font-medium tabular-nums"
                  placeholder={currency.minorUnitDigits === 0 ? "1250" : "1250.00"}
                />
              </div>
            </FormField>

            <FormField
              label="Prep time"
              error={errors.prepTime}
              hint="Roughly how long from an order coming in to this being ready. Leave it empty if it varies too much to say."
            >
              <div className="flex items-center gap-2">
                <Input
                  value={values.prepTime}
                  onChange={(e) => set("prepTime", e.target.value)}
                  inputMode="numeric"
                  placeholder="20"
                  className="w-24 tabular-nums"
                />
                <span className="text-sm text-[var(--muted-foreground)]">minutes</span>
              </div>
            </FormField>

            {previewPrice != null && previewPrice > 0 && (
              <PricePreview
                priceMinor={previewPrice}
                currency={currency}
                tax={context?.tax}
              />
            )}

          </FormSection>
        </div>

        <div className="space-y-4">
          <FormSection
            icon={ImageIcon}
            title="Photos"
            description="Dishes with a photo get ordered far more often. One good shot beats five poor ones."
            aside={
              <span className="shrink-0 text-xs text-[var(--muted-foreground)] tabular-nums">
                {images.length}/{context.maxImages}
              </span>
            }
          >
            <MealImageGallery
              value={images}
              onChange={updateImages}
              max={context.maxImages}
              disabled={saving}
              {...(errors.imageKeys ? { error: errors.imageKeys } : {})}
            />
          </FormSection>

          <FormSection
            icon={Tag}
            title="Tags"
            description="How customers filter and find this dish."
          >
            <TagMultiSelect
              label="Cuisines"
              hint=""
              options={context.cuisines}
              selected={values.cuisineIds}
              onChange={(ids) => set("cuisineIds", ids)}
              max={context.maxCuisines}
              emptyHint="No cuisines are available in your country yet."
              disabled={saving}
            />
            <TagMultiSelect
              label="Dietary tags"
              hint=""
              options={context.dietaryTags}
              selected={values.dietaryTagIds}
              onChange={(ids) => set("dietaryTagIds", ids)}
              max={context.maxDietaryTags}
              emptyHint="No dietary tags are available in your country yet."
              disabled={saving}
            />
            <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
              Dietary tags are a promise to someone with an allergy. Only tick what the kitchen can
              guarantee.
            </p>
          </FormSection>
        </div>
      </div>

      <MealModifierSection
        currency={currency}
        value={modifierGroupIds}
        onChange={setModifierGroupIds}
      />

      {/* Only shown when there is a real choice to make. */}
      {multiOutlet && (
        <FormSection
          icon={MapPin}
          title="Where it's sold"
          description="Pick the locations that serve this dish. You only write it once — set a different price anywhere it differs."
        >
          {errors.outletIds && <p className="text-xs text-[var(--destructive)]">{errors.outletIds}</p>}
          <div className="space-y-2">
            {context.outlets.map((outlet) => {
              const selected = values.outletIds.includes(outlet.id)
              return (
                <div
                  key={outlet.id}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    selected ? "border-primary/50 bg-primary/5" : "border-[var(--border)]",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          "outletIds",
                          selected
                            ? values.outletIds.filter((id) => id !== outlet.id)
                            : [...values.outletIds, outlet.id],
                        )
                      }
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-[var(--border)]",
                        )}
                      >
                        {selected && <Check className="size-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                          {outlet.name}
                          {outlet.isMainOutlet && (
                            <span className="ml-2 text-xs font-normal text-[var(--muted-foreground)]">Main</span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-[var(--muted-foreground)]">
                          {outlet.addressLine1}
                        </span>
                      </span>
                    </button>

                    {selected && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--muted-foreground)]">Price here</span>
                        <div className="relative w-32">
                          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">
                            {currency.symbol}
                          </span>
                          <Input
                            value={overrides[outlet.id] ?? ""}
                            onChange={(e) =>
                              setOverrides((prev) => ({ ...prev, [outlet.id]: e.target.value }))
                            }
                            inputMode="decimal"
                            placeholder={values.price || "same"}
                            className="h-9 pl-7 text-sm tabular-nums"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
            Leave a location&apos;s price blank to use the main price. Editing the dish later updates it
            everywhere at once.
          </p>
        </FormSection>
      )}

      {/*
        * The actions END the form and scroll with it. They used to be pinned to
        * the viewport, which made them read as app chrome rather than as part
        * of the form — you looked at the bar and had to ask whether it belonged
        * to the page or to what you were filling in. Scrolling to the end to
        * submit is how a form has always worked, and it gives a phone back the
        * height a permanent bar was taking.
        */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--muted-foreground)]">
            <span className="text-[var(--destructive)]">*</span> Required. Everything else is optional.
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => router.push("/meals")}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" className="gap-1.5 rounded-full" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add to menu"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}

/*
 * What the typed price actually breaks down to.
 *
 * The vendor sees this before they save, because "1,300" means two different
 * things depending on whether the market quotes tax-inclusive prices, and they
 * cannot price a dish sensibly without knowing which. Same principle that will
 * govern the discount builder: show the number they end up with, never just
 * the one they typed.
 *
 * The arithmetic mirrors the backend's lib/pricing/tax.ts, including deriving
 * the other side by subtraction so the parts always sum to the whole. It is a
 * preview: every saved price is broken down server-side, and that is what the
 * meal list and any future checkout read.
 */
function PricePreview({
  priceMinor, currency, tax,
}: {
  priceMinor: number
  currency  : MenuCurrency
  tax       : MenuTaxContext | undefined
}) {
  /*
   * The market's standard rate, always.
   *
   * The vendor is never asked how their dish is taxed, and should not be: this
   * platform sells ready-cooked food only, so every dish takes the same
   * treatment, and a merchant self-classifying for tax is a compliance
   * question rather than a menu one. Uber Eats and DoorDash both classify
   * centrally and never put the choice on the merchant's item form.
   *
   * Null means the market has configured no rate at all, and then no tax line
   * is shown — saying nothing is honest, inventing a zero is not.
   */
  const standard = tax?.categories.find((c) => c.isStandard)
  const rateBps = standard?.rateBps ?? tax?.standardRateBps ?? null

  if (!tax || rateBps === null) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3">
        <p className="text-xs text-[var(--muted-foreground)]">Customers will see</p>
        <p className="mt-0.5 font-display text-xl font-semibold tabular-nums text-[var(--foreground)]">
          {formatPrice(priceMinor, currency)}
        </p>
      </div>
    )
  }

  const inclusive = tax.pricesIncludeTax
  const taxMinor = inclusive
    ? Math.round((priceMinor * rateBps) / (10_000 + rateBps))
    : Math.round((priceMinor * rateBps) / 10_000)
  const grossMinor = inclusive ? priceMinor : priceMinor + taxMinor
  const netMinor = inclusive ? priceMinor - taxMinor : priceMinor

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3">
      <p className="text-xs text-[var(--muted-foreground)]">Customers will see</p>
      <p className="mt-0.5 font-display text-xl font-semibold tabular-nums text-[var(--foreground)]">
        {formatPrice(grossMinor, currency)}
      </p>

      <dl className="mt-3 space-y-1 border-t border-[var(--border)] pt-3 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[var(--muted-foreground)]">
            {tax.label} at {standard?.rateLabel ?? `${Number((rateBps / 100).toFixed(2))}%`}
          </dt>
          <dd className="tabular-nums text-[var(--foreground)]">{formatPrice(taxMinor, currency)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[var(--muted-foreground)]">You earn, before commission</dt>
          <dd className="font-medium tabular-nums text-[var(--foreground)]">
            {formatPrice(netMinor, currency)}
          </dd>
        </div>
      </dl>

      <p className="mt-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
        {inclusive
          ? `Prices here include ${tax.label}, so it comes out of what you typed.`
          : `${tax.label} is added on top of your price at checkout.`}
      </p>
    </div>
  )
}
