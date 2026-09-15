"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { Loader2, Plus, Pencil } from "lucide-react"
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  documentTypeBaseSchema,
  documentTypeCreateSchema,
  documentTypeUpdateSchema,
  type DocumentTypeCreateFormValues,
  type DocumentTypeUpdateFormValues,
} from "@/lib/zod/document-type"
import { getFieldError } from "@/lib/forms/form-helpers"
import { useCountryCities } from "@/hooks/use-country-cities"
import type { DocumentTypeConfig } from "@/types/document-type.types"

interface Props {
  /** Required for create mode — which country this document type belongs to. */
  countryId?    : string
  /** Pass for edit mode. */
  documentType? : DocumentTypeConfig
}

export function DocumentTypeFormDialog({ countryId, documentType }: Props) {
  const router = useRouter()
  const isEdit = !!documentType
  const effectiveCountryId = isEdit ? documentType?.countryId : countryId
  // Roadmap VM-P1-05 — scope can't be changed once real documents exist
  // against this type (backend enforces this; this just avoids letting an
  // admin fill out the change only to have it rejected on save).
  const hasDocuments = isEdit && (documentType?.documentCount ?? 0) > 0

  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const { cities } = useCountryCities(effectiveCountryId)

  const createForm = useForm({
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
          toast.success("Document type created", { description: `${value.name} is now part of onboarding requirements.` })
          setOpen(false)
          createForm.reset()
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

  const updateForm = useForm({
    defaultValues: {
      name             : documentType?.name ?? "",
      description      : documentType?.description ?? "",
      scope            : documentType?.scope ?? "VENDOR",
      cityId           : documentType?.cityId ?? "",
      isRequired       : documentType?.isRequired ?? true,
      requiresExpiry   : documentType?.requiresExpiry ?? true,
      expiryWarningDays: documentType?.expiryWarningDays ?? 30,
      instructions     : documentType?.instructions ?? "",
      sampleUrl        : documentType?.sampleUrl ?? "",
      complianceSeverity: documentType?.complianceSeverity ?? "MEDIUM",
      gracePeriodDays   : documentType?.gracePeriodDays ?? 0,
      enforcedFrom      : documentType?.enforcedFrom?.slice(0, 10) ?? "",
    } as DocumentTypeUpdateFormValues,
    validators: { onSubmit: documentTypeUpdateSchema },
    onSubmit: async ({ value }) => {
      if (!documentType) return
      setFormError(null)
      try {
        const res = await fetch(`/api/document-types/${documentType.id}`, {
          method : "PATCH",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({
            ...value,
            description : value.description.trim() || undefined,
            instructions: value.instructions.trim() || undefined,
            sampleUrl   : value.sampleUrl.trim() || undefined,
            enforcedFrom: value.enforcedFrom.trim() || "",
            cityId      : value.scope === "CITY" ? value.cityId : undefined,
          }),
        })
        const data = await res.json()
        if (res.ok) {
          toast.success("Document type updated")
          setOpen(false)
          router.refresh()
        } else {
          const msg = data.message ?? "Something went wrong."
          setFormError(msg)
          toast.error("Update failed", { description: msg })
        }
      } catch {
        setFormError("Network error. Please try again.")
        toast.error("Network error", { description: "Please try again." })
      }
    },
  })

  const form = isEdit ? updateForm : createForm

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setFormError(null); form.reset() } }}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full">
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className="gap-1.5 rounded-full shadow-sm transition-transform hover:-translate-y-px active:scale-[0.97]"
            style={{ backgroundImage: "linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 82%, black 12%))" }}
            disabled={!countryId}
          >
            <Plus className="h-4 w-4" />
            New Document Type
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit document type" : "New document type"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Country can't be changed after creation."
              : "Defines a document vendors or outlets must upload during onboarding. A code is generated automatically from the name."}
          </DialogDescription>
        </DialogHeader>

        <form
          id="document-type-form"
          onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}
          className="space-y-3"
        >
          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            {isEdit ? (
              <updateForm.Field name="name" validators={{ onBlur: documentTypeBaseSchema.shape.name }}>
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="doc-type-name">Name *</Label>
                    <Input
                      id="doc-type-name"
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
              </updateForm.Field>
            ) : (
              <createForm.Field name="name" validators={{ onBlur: documentTypeBaseSchema.shape.name }}>
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="doc-type-name">Name *</Label>
                    <Input
                      id="doc-type-name"
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
              </createForm.Field>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Code</Label>
              <p className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
                {isEdit ? documentType?.code : "Generated automatically from the name"}
              </p>
            </div>
          </div>

          {isEdit ? (
            <updateForm.Field name="scope">
              {(scopeField) => (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Scope</Label>
                    <Select
                      value={scopeField.state.value}
                      disabled={hasDocuments}
                      onValueChange={(v) => {
                        scopeField.handleChange(v as "VENDOR" | "OUTLET" | "CITY")
                        if (v !== "CITY") updateForm.setFieldValue("cityId", "")
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
                    {hasDocuments && (
                      <p className="text-xs text-muted-foreground">
                        Scope can&apos;t be changed — {documentType?.documentCount} document{documentType?.documentCount === 1 ? "" : "s"} already exist against this type. Deactivate it and create a new one instead.
                      </p>
                    )}
                  </div>
                  {scopeField.state.value === "CITY" && (
                    <updateForm.Field name="cityId" validators={{ onBlur: documentTypeBaseSchema.shape.cityId }}>
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
                    </updateForm.Field>
                  )}
                </>
              )}
            </updateForm.Field>
          ) : (
            <createForm.Field name="scope">
              {(scopeField) => (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Scope</Label>
                    <Select
                      value={scopeField.state.value}
                      onValueChange={(v) => {
                        scopeField.handleChange(v as "VENDOR" | "OUTLET" | "CITY")
                        if (v !== "CITY") createForm.setFieldValue("cityId", "")
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
                    <createForm.Field name="cityId" validators={{ onBlur: documentTypeBaseSchema.shape.cityId }}>
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
                    </createForm.Field>
                  )}
                </>
              )}
            </createForm.Field>
          )}

          {isEdit ? (
            <updateForm.Field name="description">
              {(field) => (
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="doc-type-description">Description (optional)</Label>
                  <Textarea
                    id="doc-type-description"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="min-h-16 text-sm"
                  />
                </div>
              )}
            </updateForm.Field>
          ) : (
            <createForm.Field name="description">
              {(field) => (
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="doc-type-description">Description (optional)</Label>
                  <Textarea
                    id="doc-type-description"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="min-h-16 text-sm"
                  />
                </div>
              )}
            </createForm.Field>
          )}

          <div className="flex flex-wrap items-center gap-5">
            {isEdit ? (
              <updateForm.Field name="isRequired">
                {(field) => (
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox checked={field.state.value} onCheckedChange={(c) => field.handleChange(c === true)} />
                    Required
                  </label>
                )}
              </updateForm.Field>
            ) : (
              <createForm.Field name="isRequired">
                {(field) => (
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox checked={field.state.value} onCheckedChange={(c) => field.handleChange(c === true)} />
                    Required
                  </label>
                )}
              </createForm.Field>
            )}

            {isEdit ? (
              <updateForm.Field name="requiresExpiry">
                {(field) => (
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox checked={field.state.value} onCheckedChange={(c) => field.handleChange(c === true)} />
                    Has expiry date
                  </label>
                )}
              </updateForm.Field>
            ) : (
              <createForm.Field name="requiresExpiry">
                {(field) => (
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox checked={field.state.value} onCheckedChange={(c) => field.handleChange(c === true)} />
                    Has expiry date
                  </label>
                )}
              </createForm.Field>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {isEdit ? (
              <updateForm.Field name="expiryWarningDays">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="doc-type-expiry-days">Expiry warning (days before)</Label>
                    <Input
                      id="doc-type-expiry-days"
                      type="number"
                      min={0}
                      max={365}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(Number(e.target.value))}
                      className="rounded-xl text-sm"
                    />
                  </div>
                )}
              </updateForm.Field>
            ) : (
              <createForm.Field name="expiryWarningDays">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="doc-type-expiry-days">Expiry warning (days before)</Label>
                    <Input
                      id="doc-type-expiry-days"
                      type="number"
                      min={0}
                      max={365}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(Number(e.target.value))}
                      className="rounded-xl text-sm"
                    />
                  </div>
                )}
              </createForm.Field>
            )}

            {isEdit ? (
              <updateForm.Field name="sampleUrl">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="doc-type-sample-url">Sample URL (optional)</Label>
                    <Input
                      id="doc-type-sample-url"
                      placeholder="https://…"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="rounded-xl text-sm"
                    />
                  </div>
                )}
              </updateForm.Field>
            ) : (
              <createForm.Field name="sampleUrl">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="doc-type-sample-url">Sample URL (optional)</Label>
                    <Input
                      id="doc-type-sample-url"
                      placeholder="https://…"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="rounded-xl text-sm"
                    />
                  </div>
                )}
              </createForm.Field>
            )}
          </div>

          {isEdit ? (
            <updateForm.Field name="instructions">
              {(field) => (
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="doc-type-instructions">Instructions shown to vendor (optional)</Label>
                  <Textarea
                    id="doc-type-instructions"
                    placeholder="e.g. Upload a clear photo of the original document"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="min-h-16 text-sm"
                  />
                </div>
              )}
            </updateForm.Field>
          ) : (
            <createForm.Field name="instructions">
              {(field) => (
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="doc-type-instructions">Instructions shown to vendor (optional)</Label>
                  <Textarea
                    id="doc-type-instructions"
                    placeholder="e.g. Upload a clear photo of the original document"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="min-h-16 text-sm"
                  />
                </div>
              )}
            </createForm.Field>
          )}

          <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
            <p className="text-xs font-semibold text-foreground">Compliance</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {isEdit ? (
                <updateForm.Field name="complianceSeverity">
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
                </updateForm.Field>
              ) : (
                <createForm.Field name="complianceSeverity">
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
                </createForm.Field>
              )}

              {isEdit ? (
                <updateForm.Field name="gracePeriodDays">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label className="text-xs" htmlFor="doc-type-grace-days">Grace period after expiry (days)</Label>
                      <Input
                        id="doc-type-grace-days"
                        type="number"
                        min={0}
                        max={365}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(Number(e.target.value))}
                        className="rounded-xl text-sm"
                      />
                    </div>
                  )}
                </updateForm.Field>
              ) : (
                <createForm.Field name="gracePeriodDays">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label className="text-xs" htmlFor="doc-type-grace-days">Grace period after expiry (days)</Label>
                      <Input
                        id="doc-type-grace-days"
                        type="number"
                        min={0}
                        max={365}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(Number(e.target.value))}
                        className="rounded-xl text-sm"
                      />
                    </div>
                  )}
                </createForm.Field>
              )}
            </div>

            {isEdit ? (
              <updateForm.Field name="enforcedFrom">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="doc-type-enforced-from">Enforced from (optional)</Label>
                    <Input
                      id="doc-type-enforced-from"
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
              </updateForm.Field>
            ) : (
              <createForm.Field name="enforcedFrom">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="doc-type-enforced-from">Enforced from (optional)</Label>
                    <Input
                      id="doc-type-enforced-from"
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
              </createForm.Field>
            )}
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <form.Subscribe selector={(s) => ({ isSubmitting: s.isSubmitting })}>
            {({ isSubmitting }) => (
              <Button
                type="submit"
                form="document-type-form"
                className="rounded-full gap-1.5 shadow-sm"
                style={{ backgroundImage: "linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 82%, black 12%))" }}
                disabled={isSubmitting}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create document type"}
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
