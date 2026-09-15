"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { Loader2, MapPinned } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { TimezoneCombobox } from "./TimezoneCombobox"
import { CityLocationMap } from "./CityLocationMap"
import { createCitySchema, type CreateCityFormValues } from "@/lib/zod/geography"
import { getFieldError } from "@/lib/forms/form-helpers"

interface Props {
  countrySlug: string
  countryName: string
  /** Country.timezones — narrows the picker to the zones this country uses. */
  countryTimezones?: readonly string[]
}

export function CityAddForm({ countrySlug, countryName, countryTimezones }: Props) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: {
      name     : "",
      // Pre-selected for a single-zone country (most of them) so the choice
      // cannot be made wrongly, and usually does not have to be made at all.
      timezone : countryTimezones?.length === 1 ? countryTimezones[0]! : "",
      latitude : undefined,
      longitude: undefined,
    } as unknown as CreateCityFormValues,
    validators: { onSubmit: createCitySchema },
    onSubmit: async ({ value }) => {
      setFormError(null)
      try {
        const res = await fetch(`/api/countries/${countrySlug}/cities`, {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify(value),
        })
        const data = await res.json()
        if (res.ok) {
          toast.success("City created", { description: `${value.name} has been added to ${countryName}.` })
          router.push(`/countries/${countrySlug}/cities`)
        } else {
          const msg = data.message ?? "Something went wrong."
          setFormError(msg)
          toast.error("Creation failed", { description: msg })
        }
      } catch {
        setFormError("Network error. Please try again.")
        toast.error("Network error", { description: "Please try again." })
      }
    },
  })

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}
      className="admin-card space-y-5"
    >
      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <form.Field name="name" validators={{ onBlur: createCitySchema.shape.name }}>
          {(field) => (
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="city-name">Name *</Label>
              <Input
                id="city-name"
                placeholder="e.g. Kisumu"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                className="rounded-xl text-sm"
                autoFocus
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-xs text-destructive">{getFieldError(field.state.meta.errors[0])}</p>
              )}
            </div>
          )}
        </form.Field>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Code</Label>
          <p className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Generated automatically from the city and country name — not shown to vendors or customers.
          </p>
        </div>
      </div>

      <form.Field name="timezone">
        {(field) => (
          <div className="space-y-1.5">
            <Label className="text-xs">Timezone *</Label>
            <TimezoneCombobox value={field.state.value} onChange={field.handleChange} countryTimezones={countryTimezones} />
            {field.state.meta.errors.length > 0 && (
              <p className="text-xs text-destructive">{getFieldError(field.state.meta.errors[0])}</p>
            )}
          </div>
        )}
      </form.Field>

      <form.Field name="latitude">
        {(latField) => (
          <form.Field name="longitude">
            {(lngField) => (
              <div className="space-y-1.5">
                <Label className="text-xs">Location *</Label>
                <CityLocationMap
                  countryName={countryName}
                  latitude={latField.state.value ?? null}
                  longitude={lngField.state.value ?? null}
                  onChange={(lat, lng) => { latField.handleChange(lat); lngField.handleChange(lng) }}
                />
                {(latField.state.meta.errors.length > 0 || lngField.state.meta.errors.length > 0) && (
                  <p className="text-xs text-destructive">Click the map to place the city&apos;s pin.</p>
                )}
              </div>
            )}
          </form.Field>
        )}
      </form.Field>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" className="rounded-full" onClick={() => router.back()}>
          Cancel
        </Button>
        <form.Subscribe selector={(s) => ({ isSubmitting: s.isSubmitting })}>
          {({ isSubmitting }) => (
            <Button
              type="submit"
              className="rounded-full gap-1.5 shadow-sm"
              style={{ backgroundImage: "linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 82%, black 12%))" }}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPinned className="h-4 w-4" />}
              {isSubmitting ? "Creating…" : "Create City"}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}
