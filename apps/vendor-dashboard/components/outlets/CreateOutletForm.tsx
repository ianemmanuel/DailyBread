"use client"

import { useRouter } from "next/navigation"
import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import {
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue,
} from "@repo/ui/components/select"
import {
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription,
} from "@repo/ui/components/card"
import {
  Loader2, 
  MapPin, 
  Phone, 
  Mail, 
  Navigation,
  Store, 
  Truck, 
  BadgeDollarSign, 
  Map,
} from "lucide-react"
import { createOutletSchema } from "@/lib/validations/create-outlet"
import type { City } from "@/types/outlet"

interface Props { cities: City[] }

const inputCls =
  "bg-[var(--background)] border-[var(--border)] text-[var(--foreground)] " +
  "placeholder:text-[var(--muted-foreground)] focus-visible:ring-[var(--primary)]"

/*
  Section card.
  Uses var(--border) which resolves to:
    light → oklch(0.86 0.006 240)  — a soft grey line
    dark  → oklch(1 0 0 / 8%)      — a faint white line
  This gives the card-from-background separation in dark theme you asked for.
*/
function Section({
  icon: Icon, title, description, children,
}: {
  icon: React.ElementType
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="dash-card" style={{ borderColor: "var(--border)" }}>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="size-4 text-[var(--primary)]" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            <CardDescription className="text-xs">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

/* Shown only once the field has been touched — avoids noise on first load */
function InlineError({ errors, touched }: { errors: unknown[]; touched: boolean }) {
  if (!touched || errors.length === 0) return null
  return (
    <p className="mt-1 text-xs text-[var(--destructive)]">{String(errors[0])}</p>
  )
}

export function CreateOutletForm({ cities }: Props) {
  const router = useRouter()

  /*
    No <FormValues> type argument.
    TanStack Form v1 infers all types from defaultValues.
    Passing an explicit type causes "Expected 12 type arguments" TS error.
  */
  const form = useForm({
    defaultValues: {
      name         : "",
      cityId       : "",
      phone        : "",
      email        : "",
      bio          : "",
      addressLine1 : "",
      addressLine2 : "",
      neighborhood : "",
      postalCode   : "",
      latitude     : "" as unknown as number,   // empty → input renders blank; validator catches it
      longitude    : "" as unknown as number,
      deliveryRadius: undefined as number | undefined,
      deliveryFee  : undefined as number | undefined,
      minimumOrder : undefined as number | undefined,
    },
    onSubmit: async ({ value }) => {
      const parsed = createOutletSchema.safeParse(value)
      if (!parsed.success) return   // field-level errors already visible inline

      const payload = {
        ...parsed.data,
        email       : parsed.data.email        || undefined,
        phone       : parsed.data.phone        || undefined,
        bio         : parsed.data.bio          || undefined,
        addressLine2: parsed.data.addressLine2 || undefined,
        neighborhood: parsed.data.neighborhood || undefined,
        postalCode  : parsed.data.postalCode   || undefined,
      }

      const res  = await fetch("/api/vendor/outlets", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        /*
          Sonner toast for server errors — non-blocking, auto-dismisses,
          vendor can fix and retry without losing their form data.
        */
        toast.error(data.message ?? "Failed to create outlet", {
          description: "Please check your details and try again.",
          duration   : 6000,
        })
        return
      }

      toast.success("Outlet created!", { description: "Your new location is now live." })

      /*
        router.push navigates to a new SSR page that fetches fresh data.
        router.refresh() after push is redundant — it causes a second
        server round-trip to the same new page. Removed.
      */
      router.push(`/dashboard/outlets/${data.data.id}`)
    },
  })

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}
      className="space-y-6"
      noValidate
    >
      {/* ── 1. Outlet Details ──────────────────────── */}
      <Section icon={Store} title="Outlet Details" description="Basic info customers will see">
        <div className="grid gap-4 sm:grid-cols-2">

          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) => {
                const r = createOutletSchema.shape.name.safeParse(value)
                return r.success ? undefined : r.error.issues[0].message
              },
            }}
          >
            {(field) => (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name">
                  Outlet Name <span className="text-[var(--destructive)]">*</span>
                </Label>
                <Input
                  id="name"
                  className={inputCls}
                  placeholder="e.g. Manu's Kitchen – Westlands"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
                <InlineError errors={field.state.meta.errors} touched={field.state.meta.isTouched} />
              </div>
            )}
          </form.Field>

          <form.Field
            name="cityId"
            validators={{
              onChange: ({ value }) => (value ? undefined : "Please select a city"),
            }}
          >
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="cityId">
                  City <span className="text-[var(--destructive)]">*</span>
                </Label>
                <Select value={field.state.value} onValueChange={field.handleChange}>
                  <SelectTrigger id="cityId" className={inputCls}>
                    <SelectValue placeholder="Select city…" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {cities.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <InlineError errors={field.state.meta.errors} touched={field.state.meta.isTouched} />
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
                const r = createOutletSchema.shape.email.safeParse(value)
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
                  placeholder="outlet@example.com"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
                <InlineError errors={field.state.meta.errors} touched={field.state.meta.isTouched} />
              </div>
            )}
          </form.Field>
        </div>

        <form.Field
          name="bio"
          validators={{
            onChange: ({ value }) =>
              value && value.length > 300 ? "Max 300 characters" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="bio">Short Description</Label>
              <Textarea
                id="bio"
                className={`${inputCls} resize-none`}
                rows={3}
                placeholder="Tell customers what makes this location special…"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              <div className="flex items-start justify-between">
                <InlineError errors={field.state.meta.errors} touched={field.state.meta.isTouched} />
                <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
                  {field.state.value?.length ?? 0}/300
                </span>
              </div>
            </div>
          )}
        </form.Field>
      </Section>

      {/* ── 2. Address ─────────────────────────────── */}
      <Section icon={MapPin} title="Location" description="Physical address for your outlet">
        <form.Field
          name="addressLine1"
          validators={{
            onChange: ({ value }) => {
              const r = createOutletSchema.shape.addressLine1.safeParse(value)
              return r.success ? undefined : r.error.issues[0].message
            },
          }}
        >
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="addressLine1">
                Street Address <span className="text-[var(--destructive)]">*</span>
              </Label>
              <Input
                id="addressLine1"
                className={inputCls}
                placeholder="123 Moi Avenue"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
              <InlineError errors={field.state.meta.errors} touched={field.state.meta.isTouched} />
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

        {/* GPS */}
        <div
          className="space-y-3 rounded-xl border p-4"
          style={{
            borderColor: "var(--border)",
            background : "color-mix(in oklch, var(--muted) 25%, transparent)",
          }}
        >
          <div className="flex items-center gap-2">
            <Navigation className="size-4 text-[var(--primary)]" />
            <p className="text-sm font-medium text-[var(--foreground)]">GPS Coordinates</p>
            <a
              href="https://maps.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs text-[var(--primary)] underline-offset-2 hover:underline"
            >
              Find on Google Maps ↗
            </a>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["latitude", "longitude"] as const).map((name) => (
              <form.Field
                key={name}
                name={name}
                validators={{
                  onChange: ({ value }) => {
                    const raw = value as unknown as string | number
                    if (raw === "" || raw === undefined || raw === null)
                      return `${name === "latitude" ? "Latitude" : "Longitude"} is required`
                    if (isNaN(value as number)) return "Enter a valid number"
                    if (name === "latitude"  && ((value as number) < -90  || (value as number) > 90))  return "Must be between -90 and 90"
                    if (name === "longitude" && ((value as number) < -180 || (value as number) > 180)) return "Must be between -180 and 180"
                    return undefined
                  },
                }}
              >
                {(field) => (
                  <div className="space-y-1.5">
                    <Label htmlFor={name}>
                      {name === "latitude" ? "Latitude" : "Longitude"}{" "}
                      <span className="text-[var(--destructive)]">*</span>
                    </Label>
                    <Input
                      id={name}
                      type="number"
                      step="any"
                      className={inputCls}
                      placeholder={name === "latitude" ? "-1.2921" : "36.8219"}
                      value={
                        (field.state.value as unknown as string) === "" ||
                        isNaN(field.state.value as number)
                          ? ""
                          : (field.state.value as number)
                      }
                      onChange={(e) =>
                        field.handleChange(
                          e.target.value === ""
                            ? ("" as unknown as number)
                            : parseFloat(e.target.value)
                        )
                      }
                      onBlur={field.handleBlur}
                    />
                    <InlineError errors={field.state.meta.errors} touched={field.state.meta.isTouched} />
                  </div>
                )}
              </form.Field>
            ))}
          </div>
        </div>
      </Section>

      {/* ── 3. Map Picker ──────────────────────────── */}
      {/*
        MAP INTEGRATION PLAN (Mapbox GL JS via react-map-gl)
        ──────────────────────────────────────────────────────
        Why Mapbox over Google Maps:
          - Cheaper at scale (Google charges per load)
          - GeoJSON polygons are first-class — service area overlays are trivial
          - react-map-gl has excellent Next.js/React 18+ support
          - fitBounds() restricts the viewport to the city bounding box natively

        Data flow:
          1. Create page SSR fetches the city object including:
             - boundingBoxNorth/South/East/West (for map viewport)
             - ServiceArea[].boundaries (GeoJSON Polygon/MultiPolygon)
          2. Pass {cityBounds, serviceAreas} as props to this form
          3. On map click → write lat/lng into form fields via:
               latField.handleChange(lngLat.lat)
               lngField.handleChange(lngLat.lng)
          4. Optionally restrict clicking outside service areas client-side
             (backend always enforces as final authority)

        Polygon support:
          - Single city, connected areas → GeoJSON Polygon
          - Disconnected zones (east + west) → GeoJSON MultiPolygon
          - Rendered as shaded fill-layer on the map
          - Admin sets these in admin dashboard; vendor sees them as read-only

        OUTSIDE SERVICE AREA flow:
          - Backend sets flagReasons: ["OUTSIDE_SERVICE_AREA"], reviewStatus: "FLAGGED"
          - Frontend toast: "We don't currently deliver here — we'll notify you when we expand."
          - Outlet still created and stored (for future area expansion notifications)

        TO INTEGRATE:
          npm install react-map-gl mapbox-gl
          Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local
          Replace the placeholder below with <OutletMapPicker /> component
      */}
      <Section icon={Map} title="Pin Your Location" description="Drop a pin on your exact outlet location">
        <div
          className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed"
          style={{ borderColor: "var(--border)" }}
        >
          <div
            className="flex size-12 items-center justify-center rounded-2xl"
            style={{ background: "color-mix(in oklch, var(--primary) 12%, transparent)" }}
          >
            <Map className="size-6 text-[var(--primary)]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[var(--foreground)]">Interactive map coming soon</p>
            <p className="mt-1 max-w-xs text-xs text-[var(--muted-foreground)]">
              You'll be able to drop a pin directly on the map. For now, enter
              coordinates manually using the Google Maps link above.
            </p>
          </div>
        </div>
      </Section>

      {/* ── 4. Delivery & Pricing ──────────────────── */}
      <Section icon={Truck} title="Delivery & Pricing" description="Optional — can be updated anytime">
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              { name: "deliveryRadius", label: "Delivery Radius (km)", placeholder: "5",   step: "0.5" },
              { name: "deliveryFee",    label: "Delivery Fee (KSh)",    placeholder: "150", step: "1"   },
              { name: "minimumOrder",   label: "Min. Order (KSh)",      placeholder: "500", step: "1"   },
            ] as const
          ).map(({ name, label, placeholder, step }) => (
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
                      field.handleChange(
                        e.target.value === "" ? undefined : parseFloat(e.target.value)
                      )
                    }
                  />
                  <InlineError errors={field.state.meta.errors} touched={field.state.meta.isTouched} />
                </div>
              )}
            </form.Field>
          ))}
        </div>
      </Section>

      {/* ── Submit ─────────────────────────────────── */}
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(isSubmitting) => (
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full gap-2 rounded-xl"
            style={{
              background: "var(--primary)",
              color     : "var(--primary-foreground)",
              boxShadow : "0 4px 14px var(--shadow-primary)",
            }}
          >
            {isSubmitting ? (
              <><Loader2 className="size-4 animate-spin" />Creating outlet…</>
            ) : (
              <><Store className="size-4" />Create Outlet</>
            )}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}