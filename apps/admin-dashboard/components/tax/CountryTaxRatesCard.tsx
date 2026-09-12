"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Plus, Star, PauseCircle, PlayCircle, Pencil } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Badge } from "@repo/ui/components/badge"
import { Checkbox } from "@repo/ui/components/checkbox"
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@repo/ui/components/sheet"
import { SearchableSelect } from "@/components/shared/SearchableSelect"
import { formatRateBps, toRateBps, type CountryTaxSettings, type CountryTaxRate, type TaxCategory } from "@/types/tax.types"

/*
 * What this market charges, per category.
 *
 * The rate is typed as a percentage and stored as basis points. That
 * conversion happens once, here, on submit — a percentage is a human's unit
 * and basis points are the stored one, and the endpoint accepts only the
 * latter so the same number can never mean two things.
 */

interface Props {
  countrySlug: string
  countryName: string
  settings   : CountryTaxSettings
  categories : TaxCategory[]
  canManage  : boolean
}

export function CountryTaxRatesCard({
  countrySlug, countryName, settings, categories, canManage,
}: Props) {
  const [editing, setEditing] = React.useState<CountryTaxRate | null>(null)
  const [adding, setAdding] = React.useState(false)

  const ratedIds = new Set(settings.rates.map((r) => r.taxCategory.id))
  const available = categories.filter((c) => !ratedIds.has(c.id))

  return (
    <div className="admin-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Rates in {countryName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A dish that names no category is charged the default rate.
          </p>
        </div>
        {canManage && available.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Add a rate
          </Button>
        )}
      </div>

      {settings.rates.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm font-medium text-foreground">No rates set yet.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Start with the rate for ordinary prepared food and mark it as the default. Add more only
            where this market genuinely charges something different.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium text-right">Rate</th>
                <th className="px-5 py-3 font-medium">Status</th>
                {canManage && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody>
              {settings.rates.map((rate) => (
                <RateRow
                  key={rate.id}
                  rate={rate}
                  countrySlug={countrySlug}
                  canManage={canManage}
                  onEdit={() => setEditing(rate)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RateSheet
        open={adding || !!editing}
        onClose={() => { setAdding(false); setEditing(null) }}
        countrySlug={countrySlug}
        countryName={countryName}
        rate={editing}
        options={editing ? [] : available}
        hasStandard={settings.hasStandardRate}
      />
    </div>
  )
}

function RateRow({
  rate, countrySlug, canManage, onEdit,
}: {
  rate: CountryTaxRate; countrySlug: string; canManage: boolean; onEdit: () => void
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const active = rate.status === "ACTIVE"

  async function toggle() {
    setPending(true)
    try {
      const res = await fetch(`/api/tax/countries/${countrySlug}/rates/${rate.id}/status`, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ status: active ? "INACTIVE" : "ACTIVE" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? "Something went wrong")
      toast.success(active ? "Rate retired" : "Rate restored")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setPending(false)
    }
  }

  return (
    <tr className="border-b last:border-0">
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{rate.taxCategory.name}</span>
          {rate.isStandard && (
            <Badge variant="secondary" className="gap-1">
              <Star className="size-3" />
              Default
            </Badge>
          )}
          {rate.taxCategory.status !== "ACTIVE" && (
            <Badge variant="outline" className="text-muted-foreground">
              Suspended platform-wide
            </Badge>
          )}
        </div>
      </td>
      <td className="px-5 py-3 text-right font-medium tabular-nums">{formatRateBps(rate.rateBps)}</td>
      <td className="px-5 py-3">
        <Badge variant={active ? "secondary" : "outline"}>{active ? "Active" : "Retired"}</Badge>
      </td>
      {canManage && (
        <td className="px-5 py-3">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="size-4" />
              <span className="sr-only">Edit {rate.taxCategory.name} rate</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={toggle} disabled={pending}>
              {pending
                ? <Loader2 className="size-4 animate-spin" />
                : active ? <PauseCircle className="size-4" /> : <PlayCircle className="size-4" />}
              <span className="sr-only">{active ? "Retire" : "Restore"} this rate</span>
            </Button>
          </div>
        </td>
      )}
    </tr>
  )
}

function RateSheet({
  open, onClose, countrySlug, countryName, rate, options, hasStandard,
}: {
  open        : boolean
  onClose     : () => void
  countrySlug : string
  countryName : string
  rate        : CountryTaxRate | null
  options     : TaxCategory[]
  hasStandard : boolean
}) {
  const router = useRouter()
  const [categoryId, setCategoryId] = React.useState("")
  const [percent, setPercent] = React.useState("")
  const [isStandard, setIsStandard] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  // Resync on open so a cancelled edit never reappears with its stale values.
  React.useEffect(() => {
    if (!open) return
    setCategoryId(rate?.taxCategory.id ?? "")
    setPercent(rate ? String(rate.rateBps / 100) : "")
    // The first rate a market sets is the default unless it says otherwise —
    // without one, nothing in the market can be priced at all.
    setIsStandard(rate?.isStandard ?? !hasStandard)
  }, [open, rate, hasStandard])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!categoryId) { toast.error("Choose a tax category."); return }

    const rateBps = toRateBps(percent)
    if (rateBps === null) { toast.error("Enter a rate between 0 and 100 percent."); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/tax/countries/${countrySlug}/rates`, {
        method : "PUT",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ taxCategoryId: categoryId, rateBps, isStandard }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? "Something went wrong")

      toast.success(`Rate saved for ${countryName}`)
      onClose()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  const preview = toRateBps(percent)

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{rate ? `Edit ${rate.taxCategory.name} rate` : "Add a rate"}</SheetTitle>
          <SheetDescription>
            What {countryName} charges for this kind of food.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="flex flex-col gap-5 px-4 pb-6">
          {!rate && (
            <div className="flex flex-col gap-2">
              <Label>
                Category <span className="text-destructive">*</span>
              </Label>
              <SearchableSelect
                options={options.map((c) => ({ value: c.id, label: c.name, hint: c.description ?? undefined }))}
                value={categoryId}
                onChange={setCategoryId}
                placeholder="Choose a category…"
                searchPlaceholder="Search categories…"
                emptyLabel="Every category already has a rate."
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="tax-rate-percent">
              Rate <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="tax-rate-percent"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                placeholder="16"
                inputMode="decimal"
                className="max-w-32"
                autoFocus
              />
              <span className="text-sm text-muted-foreground">percent</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {preview === null
                ? "A whole or fractional percentage, for example 16 or 7.5."
                : `Stored as ${preview} basis points, which reads as ${formatRateBps(preview)}.`}
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
            <Checkbox
              checked={isStandard}
              onCheckedChange={(v) => setIsStandard(v === true)}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium text-foreground">Use as the default rate</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                Charged on every dish that names no category, which is most of them. A market has exactly
                one, so choosing this moves it off whichever rate holds it now.
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save rate
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
