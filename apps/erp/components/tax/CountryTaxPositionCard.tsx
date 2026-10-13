"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  TAX_REMITTER_LABELS, TAX_REMITTER_HINTS,
  type CountryTaxSettings, type TaxRemitter,
} from "@/types/tax.types"

/*
 * One market's tax position: three answers that are genuinely independent of
 * each other, so they are three controls rather than a mode.
 *
 * Both choices are two-segment controls rather than switches, for the reason
 * the operating-hours editor was changed: a bare switch renders as a pale pill
 * whose state you have to read the label to understand, and here the two
 * options are peers rather than on and off. Neither is styled as a warning —
 * an exclusive-tax market is normal, not a problem.
 */

interface Props {
  countrySlug: string
  countryName: string
  settings   : CountryTaxSettings
  canManage  : boolean
}

export function CountryTaxPositionCard({ countrySlug, countryName, settings, canManage }: Props) {
  const router = useRouter()

  const [inclusive, setInclusive] = React.useState(settings.pricesIncludeTax)
  const [remitter, setRemitter] = React.useState<TaxRemitter>(settings.taxRemittedBy)
  const [taxName, setTaxName] = React.useState(settings.taxName ?? "")
  const [saving, setSaving] = React.useState(false)

  const dirty =
    inclusive !== settings.pricesIncludeTax ||
    remitter !== settings.taxRemittedBy ||
    (taxName.trim() || null) !== settings.taxName

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/tax/countries/${countrySlug}/settings`, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({
          pricesIncludeTax: inclusive,
          taxRemittedBy   : remitter,
          taxName         : taxName.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? "Something went wrong")

      toast.success(`${countryName}'s tax position saved`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-card flex h-full flex-col gap-6 p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Tax position</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {settings.configExists
            ? `How ${countryName} quotes prices and who is the collector.`
            : `${countryName} has no stated tax position yet. Saving here creates it.`}
        </p>
      </div>

      <Field
        label="Menu prices in this market"
        hint={
          inclusive
            ? "A vendor types the price a customer pays, and tax is carved out of it. The convention in Kenya, the UK, the EU and most of Africa."
            : "A vendor types what they keep, and tax is added at checkout. The United States convention."
        }
      >
        <Segments
          disabled={!canManage}
          value={inclusive ? "in" : "ex"}
          onChange={(v) => setInclusive(v === "in")}
          options={[
            { value: "in", label: "Include tax" },
            { value: "ex", label: "Exclude tax" },
          ]}
        />
      </Field>

      <Field label="Who remits tax on the food" hint={TAX_REMITTER_HINTS[remitter]}>
        <Segments
          disabled={!canManage}
          value={remitter}
          onChange={(v) => setRemitter(v as TaxRemitter)}
          options={[
            { value: "VENDOR", label: TAX_REMITTER_LABELS.VENDOR },
            { value: "PLATFORM", label: TAX_REMITTER_LABELS.PLATFORM },
          ]}
        />
      </Field>

      <Field
        label="What this market calls it"
        hint="Shown to vendors and customers verbatim. Left empty it reads as a generic “Tax”."
      >
        <Input
          value={taxName}
          onChange={(e) => setTaxName(e.target.value)}
          placeholder="VAT"
          maxLength={40}
          disabled={!canManage}
          className="sm:max-w-48"
        />
      </Field>

      {canManage && (
        <div className="mt-auto flex items-center justify-end gap-3 border-t pt-4">
          {!dirty && settings.configExists && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="size-3.5" />
              Saved
            </span>
          )}
          <Button onClick={save} disabled={saving || !dirty} size="sm">
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save position
          </Button>
        </div>
      )}
    </div>
  )
}

function Field({
  label, hint, children,
}: {
  label: string; hint: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
      <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  )
}

function Segments({
  value, onChange, options, disabled,
}: {
  value    : string
  onChange : (value: string) => void
  options  : { value: string; label: string }[]
  disabled?: boolean
}) {
  return (
    <div className="inline-flex w-full rounded-lg border p-0.5 sm:w-auto" role="group">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none",
              // A pointer on the already-active option would promise an action
              // that does nothing, so it gets the default cursor instead.
              active
                ? "cursor-default bg-primary text-primary-foreground"
                : "cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
