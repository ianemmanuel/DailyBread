"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "@tanstack/react-form"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import {
  Loader2, 
  MapPin, 
  Phone, 
  Mail, 
  Navigation, 
  Store,
  Truck, 
  BadgeDollarSign, 
  CheckCircle2,
} from "lucide-react"
import { z } from "zod"
import dynamic from "next/dynamic"
import type { AddressSuggestion } from "@/components/outlets/OutletLocationPicker"

/*
 * mapbox-gl is ~1.8 MB. Statically importing the picker put all of it in this
 * page's first load, for a map that is below the fold and that most visits to
 * an outlet page never touch — the vendor is usually here to change a phone
 * number or read their hours. Loading it on demand is what keeps the rest of
 * the page (and any sheet opened on it) responsive.
 */
const OutletLocationPicker = dynamic(
  () => import("@/components/outlets/OutletLocationPicker").then((m) => m.OutletLocationPicker),
  {
    ssr    : false,
    loading: () => (
      <div className="h-[420px] w-full animate-pulse rounded-2xl bg-[var(--muted)]/30" />
    ),
  },
)
import { updateOutletSchema } from "@/lib/validations/update-outlet"
import type { Outlet } from "@/types/outlet"
import type { OutletPlacement } from "@repo/types/vendor-app"
import { majorToMinor, minorToMajor } from "@/lib/menu/money"
import { useVendorCurrency } from "@/lib/queries/menu"

interface Props { outlet: Outlet }

const inputCls =
  "bg-[var(--background)] border-[var(--border)] text-[var(--foreground)] " +
  "placeholder:text-[var(--muted-foreground)] focus-visible:ring-[var(--primary)]"

/*
 * A labelled group of fields. Plain markup, not a Card: this form now renders
 * inside the outlet page's own "Outlet details" panel, and a card inside a card
 * reads as a mistake — two borders, two shadows, doubled padding eating the
 * width the map needs.
 */
function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <fieldset className="space-y-4 border-t border-[var(--border)]/60 pt-5 first-of-type:border-t-0 first-of-type:pt-0">
      <legend className="sr-only">{title}</legend>
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="size-3.5 text-[var(--primary)]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
          <p className="text-xs text-[var(--muted-foreground)]">{description}</p>
        </div>
      </div>
      {children}
    </fieldset>
  )
}

/*
 * What sits in the map's place until the vendor asks to move the pin.
 *
 * This started as a thin row with an outline button and read as "no map here"
 * — a vendor could easily conclude the map was broken and go type coordinates
 * by hand instead. So it now shows an actual map: a Mapbox Static Images
 * thumbnail of the saved pin, which is a single ~50 KB image and loads none of
 * mapbox-gl. Seeing their location on a map is the clearest possible signal
 * that the pin saved correctly and that the map works; the button on top of it
 * is then plainly an invitation to move it, not the only clue a map exists.
 */
function PinSummary({
  latitude, longitude, onMove,
}: {
  latitude : number
  longitude: number
  onMove   : () => void
}) {
  const hasPin =
    typeof latitude === "number" && !isNaN(latitude) &&
    typeof longitude === "number" && !isNaN(longitude)

  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
  // Mapbox's default attribution and logo are left on — required by their
  // terms, and this is a static image with nowhere else to put them.
  const thumbnail = hasPin && token
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/` +
      `pin-l+ef4444(${longitude},${latitude})/${longitude},${latitude},14,0/640x220@2x` +
      `?access_token=${token}`
    : null

  if (!hasPin) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border)] px-6 py-8 text-center">
        <MapPin className="size-6 text-[var(--muted-foreground)]" />
        <div>
          <p className="text-sm font-medium text-[var(--foreground)]">No location pinned yet</p>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            Drop a pin on the map so customers and couriers can find this outlet.
          </p>
        </div>
        <Button type="button" onClick={onMove} className="gap-2">
          <MapPin className="size-4" />Set location on map
        </Button>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
      {thumbnail && (
        <div className="relative">
          {/* Plain <img>: one external thumbnail doesn't justify configuring
              next/image remote patterns for the Mapbox host. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnail}
            alt={`Map showing this outlet's pinned location at ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
            className="h-[180px] w-full object-cover sm:h-[220px]"
            loading="lazy"
          />
          <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/55 via-transparent to-transparent p-4">
            <Button type="button" onClick={onMove} className="gap-2 shadow-lg">
              <Navigation className="size-4" />Move pin on map
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <MapPin className="size-3.5 shrink-0 text-[var(--primary)]" />
          <span className="tabular-nums">{latitude.toFixed(5)}, {longitude.toFixed(5)}</span>
        </p>
        {/* Without a thumbnail (no token) this is the only way in, so it stays
            a full button rather than a quiet link. */}
        <Button
          type="button"
          variant={thumbnail ? "ghost" : "default"}
          size="sm"
          onClick={onMove}
          className="gap-2 sm:shrink-0"
        >
          <Navigation className="size-3.5" />
          {thumbnail ? "Open map" : "Move pin on map"}
        </Button>
      </div>
    </div>
  )
}

export function UpdateOutletForm({ outlet }: Props) {
  const router = useRouter()

  /* Same contract as the create form: the backend's verdict for the current
   * pin, used only to stop a save updateOutlet would refuse anyway. An outlet
   * cannot change city, so the picker is always locked to its own. */
  const [placement, setPlacement] = useState<OutletPlacement | null>(null)
  const outsideCoverage = placement != null && !placement.canRegister

  /* The map only mounts when the vendor says they want to move the pin. */
  const [movingPin, setMovingPin] = useState(false)

  /* A search result replaces the address; a dragged pin only fills blanks —
     an existing outlet's address is more likely to be right than a reverse
     geocode of a pin the vendor nudged by a few metres. */
  function applyAddressSuggestion(parts: AddressSuggestion, replace: boolean) {
    for (const key of ["addressLine1", "neighborhood", "postalCode"] as const) {
      const suggested = parts[key]
      if (!suggested) continue
      if (replace || !form.getFieldValue(key)) form.setFieldValue(key, suggested)
    }
  }

  // ✅ No explicit type argument — TanStack Form infers types from defaultValues
  const { currency } = useVendorCurrency()

  const form = useForm({
    defaultValues: {
      name         : outlet.name,
      phone        : outlet.phone        ?? "",
      email        : outlet.email        ?? "",
      bio          : outlet.bio          ?? "",
      addressLine1 : outlet.addressLine1,
      addressLine2 : outlet.addressLine2 ?? "",
      neighborhood : outlet.neighborhood ?? "",
      postalCode   : outlet.postalCode   ?? "",
      latitude     : outlet.latitude,
      longitude    : outlet.longitude,
      deliveryRadius: outlet.deliveryRadius ?? undefined as number | undefined,
      // Seeded back into MAJOR units for the human — the same round trip the
      // meal form's price makes.
      deliveryFee  : minorToMajor(outlet.deliveryFeeMinor,  currency),
      minimumOrder : minorToMajor(outlet.minimumOrderMinor, currency),
    },
    onSubmit: async ({ value }) => {
      const parsed = updateOutletSchema.safeParse(value)
      if (!parsed.success) return

      const payload: Record<string, unknown> = {}
      const d = parsed.data
      if (d.name          !== outlet.name)                                        payload.name          = d.name
      if ((d.phone        || undefined) !== (outlet.phone  || undefined))         payload.phone         = d.phone || undefined
      if ((d.email        || undefined) !== (outlet.email  || undefined))         payload.email         = d.email || undefined
      if ((d.bio          || undefined) !== (outlet.bio    || undefined))         payload.bio           = d.bio   || undefined
      if (d.addressLine1  !== outlet.addressLine1)                                payload.addressLine1  = d.addressLine1
      if ((d.addressLine2 || undefined) !== (outlet.addressLine2 || undefined))   payload.addressLine2  = d.addressLine2 || undefined
      if ((d.neighborhood || undefined) !== (outlet.neighborhood || undefined))   payload.neighborhood  = d.neighborhood || undefined
      if ((d.postalCode   || undefined) !== (outlet.postalCode   || undefined))   payload.postalCode    = d.postalCode   || undefined
      if (d.latitude      !== outlet.latitude)                                    payload.latitude      = d.latitude
      if (d.longitude     !== outlet.longitude)                                   payload.longitude     = d.longitude
      if (d.deliveryRadius !== (outlet.deliveryRadius ?? undefined))              payload.deliveryRadius = d.deliveryRadius
      if (d.deliveryFee   !== minorToMajor(outlet.deliveryFeeMinor,  currency))   payload.deliveryFeeMinor  = majorToMinor(d.deliveryFee,  currency)
      if (d.minimumOrder  !== minorToMajor(outlet.minimumOrderMinor, currency))   payload.minimumOrderMinor = majorToMinor(d.minimumOrder, currency)

      if (Object.keys(payload).length === 0) return

      const res  = await fetch(`/api/outlets/${outlet.id}/update`, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.message ?? "Failed to update outlet")

      router.refresh()
    },
  })

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}
      className="space-y-6"
      noValidate
    >
      {/* ── Identity ── */}
      <Section icon={Store} title="Outlet Details" description="Name, contact & description">
        <div className="grid gap-4 sm:grid-cols-2">

          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) => {
                if (!value) return undefined
                const r = z.string().min(2).safeParse(value)
                return r.success ? undefined : r.error.issues[0].message
              },
            }}
          >
            {(field) => (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name">Outlet Name</Label>
                <Input
                  id="name"
                  className={inputCls}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
                {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                  <p className="mt-1 text-xs text-[var(--destructive)]">
                    {field.state.meta.errors[0]}
                  </p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="phone">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="phone">
                  <Phone className="mr-1 inline size-3.5" />Phone
                </Label>
                <Input
                  id="phone"
                  className={inputCls}
                  placeholder="+254 700 000 000"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>

          <form.Field
            name="email"
            validators={{
              onBlur: ({ value }) => {
                if (!value) return undefined
                const r = z.string().email().safeParse(value)
                return r.success ? undefined : "Invalid email address"
              },
            }}
          >
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="email">
                  <Mail className="mr-1 inline size-3.5" />Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  className={inputCls}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
                {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                  <p className="mt-1 text-xs text-[var(--destructive)]">
                    {field.state.meta.errors[0]}
                  </p>
                )}
              </div>
            )}
          </form.Field>
        </div>

        {/* Bio */}
        <form.Field
          name="bio"
          validators={{
            onChange: ({ value }) => {
              if (!value) return undefined
              return value.length > 300 ? "Max 300 characters" : undefined
            },
          }}
        >
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="bio">Short Description</Label>
              <Textarea
                id="bio"
                className={`${inputCls} resize-none`}
                rows={3}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              <div className="flex justify-between">
                {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                  <p className="text-xs text-[var(--destructive)]">{field.state.meta.errors[0]}</p>
                )}
                <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
                  {field.state.value?.length ?? 0}/300
                </span>
              </div>
            </div>
          )}
        </form.Field>
      </Section>

      {/* ── Address ── */}
      <Section icon={MapPin} title="Location" description="Physical address & GPS coordinates">
        <form.Field
          name="addressLine1"
          validators={{
            onChange: ({ value }) => {
              if (!value) return undefined
              const r = z.string().min(3).safeParse(value)
              return r.success ? undefined : r.error.issues[0].message
            },
          }}
        >
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="addressLine1">Street Address</Label>
              <Input
                id="addressLine1"
                className={inputCls}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
              {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                <p className="mt-1 text-xs text-[var(--destructive)]">
                  {field.state.meta.errors[0]}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <div className="grid gap-4 sm:grid-cols-3">
          {(["addressLine2", "neighborhood", "postalCode"] as const).map((name) => (
            <form.Field key={name} name={name}>
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor={name}>
                    {{ addressLine2: "Unit / Building", neighborhood: "Neighborhood", postalCode: "Postal Code" }[name]}
                  </Label>
                  <Input
                    id={name}
                    className={inputCls}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
          ))}
        </div>

        {/* The same picker the create form uses, locked to this outlet's own
            city — an outlet never moves between cities, so there is no city
            control here. Moving the pin re-resolves the operational zone
            server-side on save (updateOutlet), exactly as creating one does.
            It only mounts once the vendor asks to move the pin, which is also
            when its chunk is fetched. */}
        <form.Subscribe selector={(s) => [s.values.latitude, s.values.longitude] as const}>
          {([lat, lng]) =>
            movingPin ? (
              <OutletLocationPicker
                cityId={outlet.cityId}
                cityName={outlet.city?.name}
                latitude={typeof lat === "number" && !isNaN(lat) ? lat : null}
                longitude={typeof lng === "number" && !isNaN(lng) ? lng : null}
                onPick={(latitude, longitude) => {
                  form.setFieldValue("latitude", latitude)
                  form.setFieldValue("longitude", longitude)
                }}
                onAddressSuggested={applyAddressSuggestion}
                onPlacementChange={setPlacement}
              />
            ) : (
              <PinSummary
                latitude={lat as number}
                longitude={lng as number}
                onMove={() => setMovingPin(true)}
              />
            )
          }
        </form.Subscribe>

        <details className="rounded-xl border border-[var(--border)] px-3.5 py-2.5">
          <summary className="cursor-pointer list-none text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            <Navigation className="mr-1.5 inline size-3.5" />
            Enter coordinates manually
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {(["latitude", "longitude"] as const).map((name) => (
              <form.Field
                key={name}
                name={name}
                validators={{
                  onChange: ({ value }) => {
                    if (value === undefined) return undefined
                    if (isNaN(value as number)) return "Enter a valid number"
                    if (name === "latitude"  && ((value as number) < -90  || (value as number) > 90))  return "Must be between -90 and 90"
                    if (name === "longitude" && ((value as number) < -180 || (value as number) > 180)) return "Must be between -180 and 180"
                    return undefined
                  },
                }}
              >
                {(field) => (
                  <div className="space-y-1.5">
                    <Label htmlFor={name}>{name === "latitude" ? "Latitude" : "Longitude"}</Label>
                    <Input
                      id={name}
                      type="number"
                      step="any"
                      className={inputCls}
                      value={isNaN(field.state.value as number) ? "" : field.state.value as number}
                      onChange={(e) => field.handleChange(parseFloat(e.target.value))}
                      onBlur={field.handleBlur}
                    />
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                      <p className="mt-1 text-xs text-[var(--destructive)]">
                        {field.state.meta.errors[0]}
                      </p>
                    )}
                  </div>
                )}
              </form.Field>
            ))}
          </div>
        </details>

      </Section>

      {/* ── Delivery & Pricing ── */}
      <Section icon={Truck} title="Delivery & Pricing" description="Update delivery settings">
        <div className="grid gap-4 sm:grid-cols-3">
          {([
            { name: "deliveryRadius", label: "Delivery Radius (km)", placeholder: "5",   step: "0.5" },
            { name: "deliveryFee",    label: "Delivery Fee (KSh)",    placeholder: "150", step: "1"   },
            { name: "minimumOrder",   label: "Min. Order (KSh)",      placeholder: "500", step: "1"   },
          ] as const).map(({ name, label, placeholder, step }) => (
            <form.Field
              key={name}
              name={name}
              validators={{
                onChange: ({ value }) => {
                  if (value !== undefined && (value as number) < 0) return "Must be 0 or more"
                  return undefined
                },
              }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor={name}>
                    {name === "deliveryFee" && <BadgeDollarSign className="mr-1 inline size-3.5" />}
                    {label}
                  </Label>
                  <Input
                    id={name}
                    type="number"
                    min={0}
                    step={step}
                    className={inputCls}
                    placeholder={placeholder}
                    value={field.state.value ?? ""}
                    onChange={(e) =>
                      field.handleChange(e.target.value === "" ? undefined : parseFloat(e.target.value))
                    }
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                    <p className="mt-1 text-xs text-[var(--destructive)]">
                      {field.state.meta.errors[0]}
                    </p>
                  )}
                </div>
              )}
            </form.Field>
          ))}
        </div>
      </Section>

      {/* ── Submit ── */}
      <form.Subscribe selector={(s) => ({ isSubmitting: s.isSubmitting, errors: s.errors })}>
        {({ isSubmitting, errors }) => (
          <div className="space-y-3">
            {errors?.length > 0 && (
              <div
                className="rounded-xl border px-4 py-3 text-sm"
                style={{
                  borderColor: "color-mix(in oklch, var(--destructive) 30%, transparent)",
                  background : "color-mix(in oklch, var(--destructive) 6%, transparent)",
                  color      : "var(--destructive)",
                }}
              >
                {errors[0]}
              </div>
            )}
            <Button
              type="submit"
              disabled={isSubmitting || outsideCoverage}
              className="w-full gap-2 rounded-xl disabled:opacity-60"
              style={{
                background: "var(--primary)",
                color     : "var(--primary-foreground)",
                boxShadow : "0 4px 14px var(--shadow-primary)",
              }}
            >
              {isSubmitting ? (
                <><Loader2 className="size-4 animate-spin" />Saving changes…</>
              ) : (
                <><CheckCircle2 className="size-4" />Save Changes</>
              )}
            </Button>
            {outsideCoverage && (
              <p className="text-center text-xs text-[var(--destructive)]">
                Move your pin inside the highlighted area to save — we can&apos;t keep an outlet outside the area
                we cover in this city.
              </p>
            )}
          </div>
        )}
      </form.Subscribe>
    </form>
  )
}