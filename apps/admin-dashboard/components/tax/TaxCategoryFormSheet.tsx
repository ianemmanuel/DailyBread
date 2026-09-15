"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet"
import type { TaxCategory } from "@/types/tax.types"

/*
 * Create or rename a catalog entry. Sheet, not AlertDialog — this is a form,
 * and the repo's rule is that AlertDialog is for short confirmations only.
 *
 * `code` is not editable. It is the stable identifier the seed and any future
 * integration key on, so a rename must not move it; the backend refuses it
 * too. On create it is derived from the name.
 */

interface Props {
  /** Absent for create; the entry being renamed for edit. */
  category?: TaxCategory
  trigger? : React.ReactNode
}

export function TaxCategoryFormSheet({ category, trigger }: Props) {
  const router = useRouter()
  const isEdit = !!category

  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  // Resync on open so a cancelled edit never shows its abandoned values the
  // next time round — the sheet stays mounted so it can animate closed.
  React.useEffect(() => {
    if (!open) return
    setName(category?.name ?? "")
    setDescription(category?.description ?? "")
  }, [open, category])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      toast.error("A tax category needs a name.")
      return
    }

    setSaving(true)
    try {
      const res = await fetch(
        isEdit ? `/api/tax/categories/${category.id}` : "/api/tax/categories",
        {
          method : isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? "Something went wrong")

      toast.success(isEdit ? "Tax category updated" : "Tax category created")
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="size-4" />
            New category
          </Button>
        )}
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Rename tax category" : "New tax category"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "The code stays fixed so existing rates and meals keep pointing at the same entry."
              : "Add a distinction some market charges a different rate for. Countries then set their own rate against it."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="flex flex-col gap-5 px-4 pb-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tax-category-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tax-category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hot prepared food"
              maxLength={80}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="tax-category-description">Description</Label>
            <Textarea
              id="tax-category-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When a market should pick this rather than the standard rate."
              maxLength={500}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Written for the admin choosing a rate, not for a vendor. Vendors only ever see the name.
            </p>
          </div>

          {isEdit && (
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              Code <code className="rounded bg-background px-1 py-0.5">{category.code}</code> is fixed and
              cannot be changed.
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Save changes" : "Create category"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
