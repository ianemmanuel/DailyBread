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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { vendorTypeSchema, type VendorTypeFormValues } from "@/lib/zod/vendor-type"
import { getFieldError } from "@/lib/forms/form-helpers"
import type { VendorType } from "@/types/vendor-type.types"

interface Props {
  /** Omit for create mode, pass the vendor category for edit mode. */
  vendorCategory?: VendorType
}

/**
 * Create/edit vendor category — a real form, so it's a Sheet (slide-in
 * panel), not the AlertDialog used for short confirmations elsewhere in
 * this module (see VendorCategoryStatusAction). Edit mode keys the API
 * call off the category's slug, matching the URL it's opened from.
 */
export function VendorCategoryFormSheet({ vendorCategory }: Props) {
  const router = useRouter()
  const isEdit = !!vendorCategory

  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: {
      name       : vendorCategory?.name ?? "",
      description: vendorCategory?.description ?? "",
    } as VendorTypeFormValues,
    validators: { onSubmit: vendorTypeSchema },
    onSubmit: async ({ value }) => {
      setFormError(null)
      try {
        const res = await fetch(
          isEdit ? `/api/vendor-types/${vendorCategory.slug}` : "/api/vendor-types",
          {
            method : isEdit ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body   : JSON.stringify({
              name       : value.name.trim(),
              description: value.description.trim() || undefined,
            }),
          },
        )
        const data = await res.json()
        if (res.ok) {
          toast.success(isEdit ? "Vendor category updated" : "Vendor category created", {
            description: isEdit
              ? `${value.name} has been updated.`
              : `${value.name} is now available to assign to countries.`,
          })
          setOpen(false)
          form.reset()
          router.refresh()
          if (!isEdit && data?.data?.slug) {
            router.push(`/vendor-categories/${data.data.slug}`)
          }
        } else {
          const msg = data.message ?? "Something went wrong."
          setFormError(msg)
          toast.error(isEdit ? "Update failed" : "Creation failed", { description: msg })
        }
      } catch {
        const msg = "Network error. Please try again."
        setFormError(msg)
        toast.error("Network error", { description: msg })
      }
    },
  })

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setFormError(null); form.reset() } }}>
      {isEdit ? (
        <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={() => setOpen(true)}>
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          className="gap-1.5 rounded-full shadow-sm transition-transform hover:-translate-y-px active:scale-[0.97]"
          style={{ backgroundImage: "linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 82%, black 12%))" }}
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4" />
          New Vendor Category
        </Button>
      )}

      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit vendor category" : "New vendor category"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update the name or description shown across the admin dashboard and vendor onboarding."
              : "Vendor categories classify what an outlet sells — e.g. Restaurant, Grocery, Pharmacy — and drive which document types are required during onboarding."}
          </SheetDescription>
        </SheetHeader>

        <form
          id="vendor-category-form"
          onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}
          className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
        >
          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <form.Field name="name" validators={{ onBlur: vendorTypeSchema.shape.name }}>
            {(field) => (
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="vendor-category-name">Name *</Label>
                <Input
                  id="vendor-category-name"
                  placeholder="e.g. Restaurant"
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

          <form.Field name="description">
            {(field) => (
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="vendor-category-description">Description (optional)</Label>
                <Textarea
                  id="vendor-category-description"
                  placeholder="What kind of vendor is this?"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="min-h-20 text-sm"
                />
              </div>
            )}
          </form.Field>
        </form>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <form.Subscribe selector={(s) => ({ isSubmitting: s.isSubmitting })}>
            {({ isSubmitting }) => (
              <Button
                type="submit"
                form="vendor-category-form"
                className="rounded-full gap-1.5 shadow-sm"
                style={{ backgroundImage: "linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 82%, black 12%))" }}
                disabled={isSubmitting}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create vendor category"}
              </Button>
            )}
          </form.Subscribe>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
