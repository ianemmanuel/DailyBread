// components/geography/CityForm.tsx
"use client"

import { useRouter }        from "next/navigation"
import { useForm }          from "@tanstack/react-form"
import { toast }            from "sonner"
import { Loader2, MapPin }  from "lucide-react"
import { Button }           from "@repo/ui/components/button"
import { Input }            from "@repo/ui/components/input"
import { Label }            from "@repo/ui/components/label"
import { TimezoneCombobox } from "@/components/geography/shared/TimezoneCombobox"
import { createCitySchema } from "@/lib/zod/geography"
import { createCity }       from "@/lib/api/geography"

const inputCls =
  "bg-background border-border text-foreground " +
  "placeholder:text-muted-foreground focus-visible:ring-primary"

function InlineError({ errors, touched }: { errors: unknown[]; touched: boolean }) {
  if (!touched || !errors.length) return null
  return <p className="mt-1 text-xs text-destructive">{String(errors[0])}</p>
}

interface Props { countryId: string; countryName: string }

export function CityForm({ countryId, countryName }: Props) {
  const router = useRouter()

  const form = useForm({
    defaultValues: { name: "", code: "", timezone: "" },
    onSubmit: async ({ value }) => {
      const parsed = createCitySchema.safeParse(value)
      if (!parsed.success) return
      try {
        const city = await createCity(countryId, {
          name    : parsed.data.name,
          code    : parsed.data.code || undefined,
          timezone: parsed.data.timezone,
        })
        toast.success("City created", {
          description: `${city.name} added to ${countryName}.`,
        })
        router.push(`/geography/countries/${countryId}/cities`)
        router.refresh()
      } catch (err: unknown) {
        toast.error("Error", {
          description: err instanceof Error ? err.message : "Failed to create city",
        })
      }
    },
  })

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}
      className="space-y-5"
      noValidate
    >
      {/* Name */}
      <form.Field
        name="name"
        validators={{
          onBlur: ({ value }) => {
            const r = createCitySchema.shape.name.safeParse(value)
            return r.success ? undefined : r.error.issues[0]?.message
          },
        }}
      >
        {(f) => (
          <div className="space-y-1.5">
            <Label htmlFor="name">City name <span className="text-destructive">*</span></Label>
            <Input
              id="name" className={inputCls} placeholder="e.g. Nairobi"
              value={f.state.value}
              onChange={(e) => f.handleChange(e.target.value)}
              onBlur={f.handleBlur}
            />
            <InlineError errors={f.state.meta.errors} touched={f.state.meta.isTouched} />
          </div>
        )}
      </form.Field>

      {/* Code */}
      <form.Field name="code">
        {(f) => (
          <div className="space-y-1.5">
            <Label htmlFor="code">
              City code{" "}
              <span className="text-muted-foreground text-xs font-normal">
                (optional — e.g. NBO, DXB)
              </span>
            </Label>
            <Input
              id="code" className={inputCls} placeholder="e.g. NBO" maxLength={10}
              value={f.state.value}
              onChange={(e) => f.handleChange(e.target.value.toUpperCase())}
            />
          </div>
        )}
      </form.Field>

      {/* Timezone */}
      <form.Field
        name="timezone"
        validators={{ onChange: ({ value }) => value ? undefined : "Timezone is required" }}
      >
        {(f) => (
          <div className="space-y-1.5">
            <Label>Timezone <span className="text-destructive">*</span></Label>
            <TimezoneCombobox
              value   ={f.state.value}
              onChange={f.handleChange}
              hasError={f.state.meta.isTouched && f.state.meta.errors.length > 0}
            />
            <InlineError errors={f.state.meta.errors} touched={f.state.meta.isTouched} />
          </div>
        )}
      </form.Field>

      {/* Note */}
      <p className="rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-xs
                    text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Note:</strong> City coordinates are
        derived automatically from the boundary polygon set in the next step.
      </p>

      {/* Submit */}
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" disabled={isSubmitting} className="w-full gap-2 rounded-xl">
            {isSubmitting
              ? <><Loader2 className="size-4 animate-spin" />Creating…</>
              : <><MapPin className="size-4" />Create city</>
            }
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}