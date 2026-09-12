"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
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
  Store,
  Truck,
  BadgeDollarSign,
} from "lucide-react"
import { SearchableCombobox } from "@/components/onboarding/SearchableCombobox"
import dynamic from "next/dynamic"
import type { AddressSuggestion } from "@/components/outlets/OutletLocationPicker"

/*
 * The map is the point of this form, so it renders straight away — but
 * mapbox-gl is ~1.8 MB, and loading it as a separate chunk lets the rest of
 * the form paint and accept typing while it arrives, instead of everything
 * waiting on it.
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
import { createOutletSchema } from "@/lib/validations/create-outlet"
import type { City } from "@/types/outlet"
import type { OutletPlacement } from "@repo/types/vendor-app"
import { majorToMinor, minorToMajor } from "@/lib/menu/money"
import { useVendorCurrency } from "@/lib/queries/menu"

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
   * The backend's verdict for the current pin, kept here so the submit button
   * can refuse a location createOutlet would reject anyway. Presentation only
   * — vendor.outlet.service re-resolves the point on save and stays the gate.
   */
  const [placement, setPlacement] = useState<OutletPlacement | null>(null)
  const outsideCoverage = placement != null && !placement.canRegister

  /*
   * Address fields filled from the map. A search result is a deliberate choice
   * by the vendor, so it replaces what is there; a dragged pin only fills gaps,
   * because nudging the marker should not quietly rewrite an address they typed
   * by hand.
   */
  function applyAddressSuggestion(parts: AddressSuggestion, replace: boolean) {
    for (const key of ["addressLine1", "neighborhood", "postalCode"] as const) {
      const suggested = parts[key]
      if (!suggested) continue
      if (replace || !form.getFieldValue(key)) form.setFieldValue(key, suggested)
    }
  }

  /*
    No <FormValues> type argument.
    TanStack Form v1 infers all types from defaultValues.
    Passing an explicit type causes "Expected 12 type arguments" TS error.
  */
  const { currency } = useVendorCurrency()

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

      // Belt and braces with the disabled button above — createOutlet refuses
      // this too, but a 400 the vendor was already warned about is a worse
      // experience than never sending the request.
      if (outsideCoverage) {
        toast.error("That location is outside the area we cover", {
          description: "Move your pin inside the highlighted area and try again.",
        })
        return
      }

      /*
       * Money leaves in MINOR UNITS. The two money fields are typed in major
       * units because that is what a human types, and converted here because
       * this is the only place the currency's scale is known — 0 digits for
       * UGX, 2 for KES, 3 for KWD. Sending "150" straight into a minor-units
       * column would price a delivery at one and a half shillings.
       */
      const { deliveryFee, minimumOrder, ...rest } = parsed.data
      const payload = {
        ...rest,
        deliveryFeeMinor : majorToMinor(deliveryFee,  currency),
        minimumOrderMinor: majorToMinor(minimumOrder, currency),
        email       : parsed.data.email        || undefined,
        phone       : parsed.data.phone        || undefined,
        bio         : parsed.data.bio          || undefined,
        addressLine2: parsed.data.addressLine2 || undefined,
        neighborhood: parsed.data.neighborhood || undefined,
        postalCode  : parsed.data.postalCode   || undefined,
      }

      const res  = await fetch("/api/outlets/create", {
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

      toast.success("Outlet created!", {
        description: data.data?.clearanceStatus === "PENDING_DOCUMENTS"
          ? "Upload the required document under Documents to bring it live."
          : "Your new location is live once you publish your storefront.",
      })

      /*
        router.push navigates to a new SSR page that fetches fresh data.
        router.refresh() after push is redundant — it causes a second
        server round-trip to the same new page. Removed.
      */
      router.push(`/outlets/${data.data.id}`)
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
      <Section
        icon={MapPin}
        title="Location"
        description="Where this outlet operates — and what we can do there"
      >
        {/* City drives everything below it: the map, the coverage overlay and
            the verdict. So it leads the section rather than sitting up with
            the outlet's name. */}
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
              <SearchableCombobox
                aria-label="City"
                options={cities.map((c) => ({ value: c.id, label: c.name }))}
                value={field.state.value || undefined}
                onChange={(v) => {
                  field.handleChange(v)
                  // A pin from the previous city is meaningless here — clear it
                  // rather than silently carrying coordinates across cities.
                  form.setFieldValue("latitude", "" as unknown as number)
                  form.setFieldValue("longitude", "" as unknown as number)
                  setPlacement(null)
                }}
                placeholder={cities.length ? "Select city…" : "No active cities available"}
                searchPlaceholder="Search cities…"
                emptyText="No matching city."
                disabled={cities.length === 0}
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                Cities where DailyBread currently operates in your country.
              </p>
              <InlineError errors={field.state.meta.errors} touched={field.state.meta.isTouched} />
            </div>
          )}
        </form.Field>

        <form.Subscribe selector={(s) => [s.values.cityId, s.values.latitude, s.values.longitude] as const}>
          {([cityId, lat, lng]) => (
            <OutletLocationPicker
              cityId={cityId as string}
              cityName={cities.find((c) => c.id === cityId)?.name}
              latitude={typeof lat === "number" && !isNaN(lat) ? lat : null}
              longitude={typeof lng === "number" && !isNaN(lng) ? lng : null}
              onPick={(latitude, longitude) => {
                form.setFieldValue("latitude", latitude)
                form.setFieldValue("longitude", longitude)
              }}
              onAddressSuggested={applyAddressSuggestion}
              onPlacementChange={setPlacement}
            />
          )}
        </form.Subscribe>

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

        {/* Manual coordinates stay available as an escape hatch — the map is
            unavailable without a Mapbox token, and a vendor who already knows
            their exact coordinates should not be forced through it. The picker
            renders these same values, so typing here moves the pin. */}
        <details className="rounded-xl border border-[var(--border)] px-3.5 py-2.5">
          <summary className="cursor-pointer list-none text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            Enter coordinates manually
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
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
        </details>

      </Section>

      {/* ── 3. Delivery & Pricing ──────────────────── */}
      <Section icon={Truck} title="Delivery & Pricing" description="Optional — can be updated anytime">
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              { name: "deliveryRadius", label: "Delivery Radius (km)", placeholder: "5",   step: "0.5" },
              { name: "deliveryFee",    label: `Delivery fee (${currency?.symbol ?? ""})`.trim(),   placeholder: "150", step: "1" },
              { name: "minimumOrder",   label: `Minimum order (${currency?.symbol ?? ""})`.trim(), placeholder: "500", step: "1" },
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
            disabled={isSubmitting || outsideCoverage}
            className="w-full gap-2 rounded-xl disabled:opacity-60"
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

      {/* Answers "is that everything?" before they wonder. Hours and documents
          both need an outlet id, so neither can be part of creating one. */}
      <p className="-mt-3 text-center text-xs text-[var(--muted-foreground)]">
        You&apos;ll set opening hours and upload any required documents on the outlet&apos;s own page next.
      </p>

      {outsideCoverage && (
        <p className="-mt-3 text-center text-xs text-[var(--destructive)]">
          Move your pin inside the highlighted area to continue — we can&apos;t register an outlet outside the
          area we cover in this city.
        </p>
      )}
    </form>
  )
}