"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Loader2, Percent, BadgePercent, CalendarClock, Store, UtensilsCrossed, Gauge, Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { FormSection, FormField } from "@/components/dashboard/form"
import { ClientApiError } from "@/lib/api/client"
import { majorToMinor, minorToMajor, formatPrice } from "@/lib/menu/money"
import { NetPreview } from "./NetPreview"
import { DAYS, toBps, formatBps } from "./discount-meta"
import {
  useDiscountContext, useCreateDiscount, useUpdateDiscount,
  type Discount, type DiscountType, type DiscountDay, type UpsertDiscountRequest,
} from "@/lib/queries/discounts"

/*
 * Create or edit one offer.
 *
 * Same section/field shape as the meal and profile forms, so a vendor never
 * meets two ways of filling something in. The actions end the form and scroll
 * with it rather than being pinned, per the correction made to the meal form.
 *
 * Two things specific to offers:
 *   1. THE NET PREVIEW IS THE POINT. It updates as they type, because a
 *      percentage alone tells a merchant nothing about what it costs them.
 *   2. A PERCENTAGE IS TYPED, BASIS POINTS ARE SENT. Same split the tax and
 *      commission forms make.
 */

interface Props { discount?: Discount }

interface FormValues {
  name       : string
  description: string
  type       : DiscountType
  percent    : string
  amount     : string
  minSubtotal: string
  allOutlets : boolean
  outletIds  : string[]
  allItems   : boolean
  menuItemIds: string[]
  startsAt   : string
  endsAt     : string
  daysOfWeek : DiscountDay[]
  startTime  : string
  endTime    : string
  budget     : string
  maxRedemptions: string
  maxPerCustomer: string
}

/** Datetime-local wants "YYYY-MM-DDTHH:mm" in local time. */
function toLocalInput(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function DiscountForm({ discount }: Props) {
  const router = useRouter()
  const { data: context, isLoading } = useDiscountContext()
  const createOffer = useCreateDiscount()
  const updateOffer = useUpdateDiscount(discount?.id ?? "")

  const isEdit = !!discount
  const [saving, setSaving] = React.useState(false)
  const [values, setValues] = React.useState<FormValues>({
    name: "", description: "", type: "PERCENTAGE_OFF_ITEMS",
    percent: "", amount: "", minSubtotal: "",
    allOutlets: true, outletIds: [], allItems: true, menuItemIds: [],
    startsAt: toLocalInput(null), endsAt: "",
    daysOfWeek: [], startTime: "", endTime: "",
    budget: "", maxRedemptions: "", maxPerCustomer: "",
  })

  const currency = context?.currency
  const seeded = React.useRef(false)

  React.useEffect(() => {
    if (!discount || !currency || seeded.current) return
    seeded.current = true
    setValues({
      name       : discount.name,
      description: discount.description ?? "",
      type       : discount.type,
      percent    : discount.percentBps != null ? String(discount.percentBps / 100) : "",
      amount     : discount.amountMinor != null ? String(minorToMajor(discount.amountMinor, currency) ?? "") : "",
      minSubtotal: discount.minSubtotalMinor != null ? String(minorToMajor(discount.minSubtotalMinor, currency) ?? "") : "",
      allOutlets : discount.appliesToAllOutlets,
      outletIds  : discount.outlets.map((o) => o.id),
      allItems   : discount.appliesToAllItems,
      menuItemIds: discount.items.map((i) => i.id),
      startsAt   : toLocalInput(discount.startsAt),
      endsAt     : discount.endsAt ? toLocalInput(discount.endsAt) : "",
      daysOfWeek : discount.daysOfWeek,
      startTime  : discount.startTime ?? "",
      endTime    : discount.endTime ?? "",
      budget     : discount.budgetMinor != null ? String(minorToMajor(discount.budgetMinor, currency) ?? "") : "",
      maxRedemptions: discount.maxRedemptions != null ? String(discount.maxRedemptions) : "",
      maxPerCustomer: discount.maxPerCustomer != null ? String(discount.maxPerCustomer) : "",
    })
  }, [discount, currency])

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  if (isLoading || !context || !currency) {
    return <div className="space-y-4"><Skeleton className="h-64 w-full" /><Skeleton className="h-48 w-full" /></div>
  }

  const isPercentage = values.type === "PERCENTAGE_OFF_ITEMS"
  const percentBps = toBps(values.percent)
  const overCeiling = percentBps != null && percentBps > context.maxDiscountBps

  /* A real dish to price the preview against, so the number is concrete rather
   * than an invented round figure. Falls back only when the menu is empty. */
  const sample = context.items[0] ?? null
  const sampleMinor = sample?.basePriceMinor ?? majorToMinor(1000, currency) ?? 100_000
  const previewOff = isPercentage
    ? (percentBps != null ? Math.round((sampleMinor * percentBps) / 10_000) : null)
    : (majorToMinor(Number(values.amount) || 0, currency) ?? null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!values.name.trim()) { toast.error("Give this offer a name."); return }

    const body: UpsertDiscountRequest = {
      name       : values.name.trim(),
      description: values.description.trim() || null,
      type       : values.type,
      ...(isPercentage
        ? { percentBps: percentBps ?? 0 }
        : {
            amountMinor     : majorToMinor(Number(values.amount) || 0, currency!) ?? 0,
            minSubtotalMinor: values.minSubtotal.trim()
              ? majorToMinor(Number(values.minSubtotal), currency!) ?? null
              : null,
          }),
      appliesToAllOutlets: values.allOutlets,
      outletIds          : values.allOutlets ? [] : values.outletIds,
      appliesToAllItems  : isPercentage ? values.allItems : true,
      menuItemIds        : isPercentage && !values.allItems ? values.menuItemIds : [],
      startsAt   : new Date(values.startsAt).toISOString(),
      endsAt     : values.endsAt ? new Date(values.endsAt).toISOString() : null,
      daysOfWeek : values.daysOfWeek,
      startTime  : values.startTime || null,
      endTime    : values.endTime || null,
      budgetMinor   : values.budget.trim() ? majorToMinor(Number(values.budget), currency!) ?? null : null,
      maxRedemptions: values.maxRedemptions.trim() ? Number(values.maxRedemptions) : null,
      maxPerCustomer: values.maxPerCustomer.trim() ? Number(values.maxPerCustomer) : null,
    }

    setSaving(true)
    try {
      if (isEdit) await updateOffer.mutateAsync(body)
      else await createOffer.mutateAsync(body)
      toast.success(isEdit ? "Offer saved" : "Offer created")
      router.push("/offers")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!context.vendorIsLive && (
        <p className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3 text-sm text-[var(--muted-foreground)]">
          <Info className="mt-0.5 size-4 shrink-0" />
          You can set this up now. It won&apos;t reach anyone until your storefront is published, and
          then it starts on its own.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <FormSection icon={BadgePercent} title="The offer" description="What it is and what it takes off.">
            <FormField label="Name" required>
              <Input
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Tuesday 20% off mains"
                maxLength={80}
              />
            </FormField>

            <FormField label="Note" hint="Only you see this. A reminder of why you ran it.">
              <Textarea
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
                maxLength={300}
              />
            </FormField>

            <FormField label="Kind of offer" required>
              <div className="grid gap-2 sm:grid-cols-2">
                <TypeCard
                  active={isPercentage}
                  onClick={() => set("type", "PERCENTAGE_OFF_ITEMS")}
                  title="Percentage off dishes"
                  body="Takes a share off each covered dish, including its options."
                />
                <TypeCard
                  active={!isPercentage}
                  onClick={() => set("type", "AMOUNT_OFF_ORDER")}
                  title="Amount off the order"
                  body="A flat amount off the basket once it reaches a minimum."
                />
              </div>
            </FormField>

            {isPercentage ? (
              <FormField
                label="How much off"
                required
                error={overCeiling ? `The most you can take off is ${formatBps(context.maxDiscountBps)}.` : undefined}
                hint={`Up to ${formatBps(context.maxDiscountBps)}.`}
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={values.percent}
                    onChange={(e) => set("percent", e.target.value)}
                    inputMode="decimal"
                    placeholder="20"
                    className="w-24 tabular-nums"
                  />
                  <Percent className="size-4 text-[var(--muted-foreground)]" />
                </div>
              </FormField>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Amount off" required>
                  <MoneyInput value={values.amount} onChange={(v) => set("amount", v)} symbol={currency.symbol} />
                </FormField>
                <FormField label="Minimum spend" hint="The basket has to reach this first.">
                  <MoneyInput value={values.minSubtotal} onChange={(v) => set("minSubtotal", v)} symbol={currency.symbol} />
                </FormField>
              </div>
            )}
          </FormSection>

          <FormSection icon={CalendarClock} title="When it runs" description="Dates, and an optional daily window.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Starts" required>
                <Input type="datetime-local" value={values.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
              </FormField>
              <FormField label="Ends" hint="Leave empty to run until you stop it.">
                <Input type="datetime-local" value={values.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
              </FormField>
            </div>

            <FormField label="Days" hint="Pick none to run every day.">
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((day) => {
                  const on = values.daysOfWeek.includes(day.value)
                  return (
                    <button
                      key={day.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set("daysOfWeek",
                        on ? values.daysOfWeek.filter((d) => d !== day.value) : [...values.daysOfWeek, day.value])}
                      className={cn(
                        "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        on
                          ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                          : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
                      )}
                    >
                      {day.short}
                    </button>
                  )
                })}
              </div>
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="From" hint="Set both or neither. 22:00–02:00 works for a late offer.">
                <Input type="time" value={values.startTime} onChange={(e) => set("startTime", e.target.value)} />
              </FormField>
              <FormField label="Until">
                <Input type="time" value={values.endTime} onChange={(e) => set("endTime", e.target.value)} />
              </FormField>
            </div>
          </FormSection>

          <FormSection icon={Store} title="Where it applies" description="Locations, and which dishes.">
            <FormField label="Locations">
              <AllOrSome
                all={values.allOutlets}
                onAll={(v) => set("allOutlets", v)}
                allLabel="All my locations"
                options={context.outlets}
                selected={values.outletIds}
                onToggle={(id) => set("outletIds",
                  values.outletIds.includes(id)
                    ? values.outletIds.filter((o) => o !== id)
                    : [...values.outletIds, id])}
              />
            </FormField>

            {isPercentage && (
              <FormField label="Dishes" hint="An offer on everything is fine — it just costs more.">
                <AllOrSome
                  all={values.allItems}
                  onAll={(v) => set("allItems", v)}
                  allLabel="Every dish on my menu"
                  options={context.items.map((i) => ({ id: i.id, name: i.name }))}
                  selected={values.menuItemIds}
                  onToggle={(id) => set("menuItemIds",
                    values.menuItemIds.includes(id)
                      ? values.menuItemIds.filter((m) => m !== id)
                      : [...values.menuItemIds, id])}
                />
              </FormField>
            )}
          </FormSection>

          <FormSection icon={Gauge} title="Limits" description="Optional caps so an offer can't run away with you.">
            <p className="rounded-lg bg-[var(--muted)]/50 px-3 py-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
              These are recorded now but not enforced yet — there are no orders to count against.
              They&apos;ll start applying the moment customers can order.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Total budget">
                <MoneyInput value={values.budget} onChange={(v) => set("budget", v)} symbol={currency.symbol} />
              </FormField>
              <FormField label="Max uses">
                <Input value={values.maxRedemptions} onChange={(e) => set("maxRedemptions", e.target.value)} inputMode="numeric" placeholder="100" />
              </FormField>
              <FormField label="Per customer">
                <Input value={values.maxPerCustomer} onChange={(e) => set("maxPerCustomer", e.target.value)} inputMode="numeric" placeholder="1" />
              </FormField>
            </div>
          </FormSection>
        </div>

        <div className="space-y-4">
          <div className="lg:sticky lg:top-4">
            <NetPreview
              sampleMinor={sampleMinor}
              discountMinor={previewOff}
              currency={currency}
              commissionRateBps={context.commissionRateBps}
              tax={context.tax}
              sampleLabel={sample?.name}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--muted-foreground)]">
            <span className="text-[var(--destructive)]">*</span> Required. Everything else is optional.
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => router.push("/offers")} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || overCeiling}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Save offer" : "Create offer"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}

function MoneyInput({
  value, onChange, symbol,
}: {
  value: string; onChange: (v: string) => void; symbol: string
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted-foreground)]">
        {symbol}
      </span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" className="pl-10 tabular-nums" />
    </div>
  )
}

function TypeCard({
  active, onClick, title, body,
}: {
  active: boolean; onClick: () => void; title: string; body: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "cursor-pointer rounded-xl border p-3 text-left transition-colors",
        active
          ? "border-[var(--primary)] bg-[var(--primary)]/5"
          : "border-[var(--border)] hover:bg-[var(--muted)]/50",
      )}
    >
      <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-foreground)]">{body}</p>
    </button>
  )
}

/*
 * "All" is a deliberate choice, not the absence of one — the same reason the
 * backend uses a flag rather than an empty list. Choosing "only some" and
 * picking nothing is an error there, so the control makes the two states
 * visibly different here.
 */
function AllOrSome({
  all, onAll, allLabel, options, selected, onToggle,
}: {
  all     : boolean
  onAll   : (v: boolean) => void
  allLabel: string
  options : { id: string; name: string }[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5">
        {[
          { value: true,  label: allLabel },
          { value: false, label: "Only some" },
        ].map((segment) => {
          const active = segment.value === all
          return (
            <button
              key={String(segment.value)}
              type="button"
              aria-pressed={active}
              onClick={() => onAll(segment.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "cursor-default bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "cursor-pointer text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
              )}
            >
              {segment.label}
            </button>
          )
        })}
      </div>

      {!all && (
        options.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)]">Nothing to choose from yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {options.map((option) => {
              const on = selected.includes(option.id)
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggle(option.id)}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors",
                    on
                      ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
                  )}
                >
                  {option.name}
                </button>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
