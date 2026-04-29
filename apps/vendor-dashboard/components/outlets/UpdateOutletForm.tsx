"use client"

import { useRouter } from "next/navigation"
import { useForm } from "@tanstack/react-form"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import { 
    Card, 
    CardContent, 
    CardHeader, 
    CardTitle, 
    CardDescription 
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
  CheckCircle2,
} from "lucide-react"
import { z } from "zod"
import { updateOutletSchema } from "@/lib/validations/update-outlet"
import type { Outlet } from "@/types/outlet"

interface Props { outlet: Outlet }

const inputCls =
  "bg-[var(--background)] border-[var(--border)] text-[var(--foreground)] " +
  "placeholder:text-[var(--muted-foreground)] focus-visible:ring-[var(--primary)]"

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
    <Card className="dash-card border-0">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
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

export function UpdateOutletForm({ outlet }: Props) {
  const router = useRouter()

  // ✅ No explicit type argument — TanStack Form infers types from defaultValues
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
      deliveryFee  : outlet.deliveryFee    ?? undefined as number | undefined,
      minimumOrder : outlet.minimumOrder   ?? undefined as number | undefined,
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
      if (d.deliveryFee   !== (outlet.deliveryFee    ?? undefined))               payload.deliveryFee   = d.deliveryFee
      if (d.minimumOrder  !== (outlet.minimumOrder   ?? undefined))               payload.minimumOrder  = d.minimumOrder

      if (Object.keys(payload).length === 0) return

      const res  = await fetch(`/api/vendor/outlets/${outlet.id}`, {
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
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
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
              disabled={isSubmitting}
              className="w-full gap-2 rounded-xl"
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
          </div>
        )}
      </form.Subscribe>
    </form>
  )
}