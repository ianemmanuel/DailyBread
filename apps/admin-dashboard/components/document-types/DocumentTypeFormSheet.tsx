"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  documentTypeBaseSchema,
  documentTypeCreateSchema,
  type DocumentTypeCreateFormValues,
} from "@/lib/zod/document-type"
import { getFieldError } from "@/lib/forms/form-helpers"
import { useCountryCities } from "@/hooks/use-country-cities"

interface Props {
  countryId: string
}

/**
 * Create-only — editing an existing document type stays on its detail page
 * (/countries/[slug]/documents/[id], via DocumentTypeFormDialog). Document
 * CREATION only happens from /countries/[slug]/documents, per the "add
 * document" workflow moving off the country hub page.
 */
export function DocumentTypeFormSheet({ countryId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const { cities } = useCountryCities(countryId)

  const form = useForm({
    defaultValues: {
      name             : "",
      description      : "",
      scope            : "VENDOR",
      cityId           : "",
      isRequired       : true,
      requiresExpiry   : true,
      expiryWarningDays: 30,
      instructions     : "",
      sampleUrl        : "",
      complianceSeverity: "MEDIUM",
      gracePeriodDays   : 0,
      enforcedFrom      : "",
    } as DocumentTypeCreateFormValues,
    validators: { onSubmit: documentTypeCreateSchema },
    onSubmit: async ({ value }) => {
      setFormError(null)
      try {
        const res = await fetch("/api/document-types", {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({
            ...value,
            description : value.description.trim() || undefined,
            instructions: value.instructions.trim() || undefined,
            sampleUrl   : value.sampleUrl.trim() || undefined,
            enforcedFrom: value.enforcedFrom.trim() || undefined,
            cityId      : value.scope === "CITY" ? value.cityId : undefined,
            countryId,
          }),
        })
        const data = await res.json()
        if (res.ok) {
          toast.success("Document created", { description: `${value.name} is now part of onboarding requirements.` })
          setOpen(false)
          form.reset()
          router.refresh()
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
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setFormError(null); form.reset() } }}>
      <SheetTrigger asChild>
        <Button
          type="button"
          size="sm"
          className="gap-1.5 rounded-full shadow-sm transition-transform hover:-translate-y-px active:scale-[0.97]"
          style={{ backgroundImage: "linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 82%, black 12%))" }}
        >
          <Plus className="h-4 w-4" />
          Add Document
        </Button>
      </SheetTrigger>

      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>New document</SheetTitle>
          <SheetDescription>
            Defines a document vendors or outlets must upload during onboarding. A code is generated automatically from the name.
          </SheetDescription>
        </SheetHeader>

        <form
          id="document-create-form"
          onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}
          className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
        >
          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <form.Field name="name" validators={{ onBlur: documentTypeBaseSchema.shape.name }}>
            {(field) => (
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="doc-name">Name *</Label>
                <Input
                  id="doc-name"
                  placeholder="e.g. Business Registration Certificate"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  className="rounded-xl text-sm"
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="text-xs text-destructive">{getFieldError(field.state.meta.errors[0])}</p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="scope">
            {(scopeField) => (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Scope</Label>
                  <Select
                    value={scopeField.state.value}
                    onValueChange={(v) => {
                      scopeField.handleChange(v as "VENDOR" | "OUTLET" | "CITY")
                      if (v !== "CITY") form.setFieldValue("cityId", "")
                    }}
                  >
                    <SelectTrigger className="w-full rounded-xl text-sm" style={{ backgroundColor: "var(--input)", color: "var(--foreground)" }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl" style={{ backgroundColor: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)" }}>
                      <SelectItem value="VENDOR" className="rounded-lg">Vendor — required once per vendor account</SelectItem>
                      <SelectItem value="OUTLET" className="rounded-lg">Outlet — required once per outlet, nationwide</SelectItem>
                      <SelectItem value="CITY" className="rounded-lg">City — once per vendor per city, inherited by their outlets there</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {scopeField.state.value === "CITY" && (
                  <form.Field name="cityId" validators={{ onBlur: documentTypeBaseSchema.shape.cityId }}>
                    {(cityField) => (
                      <div className="space-y-1.5">
                        <Label className="text-xs">City *</Label>
                        <Select value={cityField.state.value || undefined} onValueChange={cityField.handleChange}>
                          <SelectTrigger className="w-full rounded-xl text-sm" style={{ backgroundColor: "var(--input)", color: "var(--foreground)" }}>
                            <SelectValue placeholder={cities.length === 0 ? "No active cities in this country yet" : "Select a city…"} />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl" style={{ backgroundColor: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)" }}>
                            {cities.map((c) => (
                              <SelectItem key={c.id} value={c.id} className="rounded-lg">{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {cityField.state.meta.errors.length > 0 && (
                          <p className="text-xs text-destructive">{getFieldError(cityField.state.meta.errors[0])}</p>
                        )}
                      </div>
                    )}
                  </form.Field>
                )}
              </>
            )}
          </form.Field>

          <form.Field name="description">
            {(field) => (
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="doc-description">Description (optional)</Label>
                <Textarea
                  id="doc-description"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="min-h-16 text-sm"
                />
              </div>
            )}
          </form.Field>

          <div className="flex flex-wrap items-center gap-5">
            <form.Field name="isRequired">
              {(field) => (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={field.state.value} onCheckedChange={(c) => field.handleChange(c === true)} />
                  Mandatory
                </label>
              )}
            </form.Field>

            <form.Field name="requiresExpiry">
              {(field) => (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={field.state.value} onCheckedChange={(c) => field.handleChange(c === true)} />
                  Has expiry date
                </label>
              )}
            </form.Field>
          </div>

          <p className="text-xs text-muted-foreground">
            Leaving this unlinked to any vendor category on the next page means it applies to every vendor category
            in this country. Link specific categories there to restrict it instead.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <form.Field name="expiryWarningDays">
              {(field) => (
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="doc-expiry-days">Expiry warning (days before)</Label>
                  <Input
                    id="doc-expiry-days"
                    type="number"
                    min={0}
                    max={365}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(Number(e.target.value))}
                    className="rounded-xl text-sm"
                  />
                </div>
              )}
            </form.Field>

            <form.Field name="sampleUrl">
              {(field) => (
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="doc-sample-url">Sample URL (optional)</Label>
                  <Input
                    id="doc-sample-url"
                    placeholder="https://…"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="rounded-xl text-sm"
                  />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="instructions">
            {(field) => (
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="doc-instructions">Instructions shown to vendor (optional)</Label>
                <Textarea
                  id="doc-instructions"
                  placeholder="e.g. Upload a clear photo of the original document"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="min-h-16 text-sm"
                />
              </div>
            )}
          </form.Field>

          <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
            <p className="text-xs font-semibold text-foreground">Compliance</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <form.Field name="complianceSeverity">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Severity</Label>
                    <Select value={field.state.value} onValueChange={(v) => field.handleChange(v as "LOW" | "MEDIUM" | "CRITICAL")}>
                      <SelectTrigger className="w-full rounded-xl text-sm" style={{ backgroundColor: "var(--input)", color: "var(--foreground)" }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl" style={{ backgroundColor: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)" }}>
                        <SelectItem value="LOW" className="rounded-lg">Low</SelectItem>
                        <SelectItem value="MEDIUM" className="rounded-lg">Medium</SelectItem>
                        <SelectItem value="CRITICAL" className="rounded-lg">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>

              <form.Field name="gracePeriodDays">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="doc-grace-days">Grace period after expiry (days)</Label>
                    <Input
                      id="doc-grace-days"
                      type="number"
                      min={0}
                      max={365}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(Number(e.target.value))}
                      className="rounded-xl text-sm"
                    />
                  </div>
                )}
              </form.Field>
            </div>

            <form.Field name="enforcedFrom">
              {(field) => (
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="doc-enforced-from">Enforced from (optional)</Label>
                  <Input
                    id="doc-enforced-from"
                    type="date"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="rounded-xl text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to require it immediately. Set a future date to give already-approved vendors a transition window before it counts as a missing-document compliance issue.
                  </p>
                </div>
              )}
            </form.Field>
          </div>
        </form>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <form.Subscribe selector={(s) => ({ isSubmitting: s.isSubmitting })}>
            {({ isSubmitting }) => (
              <Button
                type="submit"
                form="document-create-form"
                className="rounded-full gap-1.5 shadow-sm"
                style={{ backgroundImage: "linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 82%, black 12%))" }}
                disabled={isSubmitting}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? "Creating…" : "Create document"}
              </Button>
            )}
          </form.Subscribe>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
