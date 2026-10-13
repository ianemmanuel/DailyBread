"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Plus, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetTrigger,
} from "@/components/ui/sheet"
import type { FoodTagKind, FoodTagRow } from "@/types/food-tag.types"

/*
 * Create / edit for both catalogs. Sheet rather than AlertDialog because this
 * is a form, following the convention already set by VendorCategoryFormSheet.
 *
 * Used two ways: as a trigger button (create) and as a controlled sheet the
 * table opens for a row (edit).
 */

const MAX_NAME = 60
const MAX_DESCRIPTION = 160

interface Props {
  kind    : FoodTagKind
  singular: string
  /** Present in edit mode, null when creating. */
  tag?    : FoodTagRow | null
  open?   : boolean
  onOpenChange?: (open: boolean) => void
  /** Renders a create trigger when no external open state is supplied. */
  withTrigger? : boolean
}

export function FoodTagFormSheet({ kind, singular, tag, open, onOpenChange, withTrigger }: Props) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setInternalOpen

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed from the row each time the sheet opens: the sheet stays mounted so
  // it can animate closed, so without this a cancelled edit would reappear.
  useEffect(() => {
    if (!isOpen) return
    setName(tag?.name ?? "")
    setDescription(tag?.description ?? "")
    setError(null)
  }, [isOpen, tag])

  const isEdit = !!tag
  const trimmedName = name.trim()
  const canSave = trimmedName.length > 0 && trimmedName.length <= MAX_NAME && !saving

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(
        isEdit ? `/api/food-tags/${kind}/${tag!.id}` : `/api/food-tags/${kind}`,
        {
          method : isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({ name: trimmedName, description: description.trim() || undefined }),
        },
      )
      const body = await res.json()
      if (!res.ok) { setError(body.message ?? "Couldn't save"); return }

      toast.success(isEdit ? `${trimmedName} updated` : `${trimmedName} added`)
      setOpen(false)
      router.refresh()
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      {withTrigger && (
        <SheetTrigger asChild>
          <Button size="sm" className="gap-2">
            <Plus className="size-4" />Add {singular}
          </Button>
        </SheetTrigger>
      )}

      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-base">
            {isEdit ? `Edit ${singular}` : `New ${singular}`}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {isEdit
              ? "Renaming updates what vendors and customers see everywhere."
              : `Added to the global catalog. Each country then chooses whether to offer it.`}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="tag-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tag-name"
              value={name}
              maxLength={MAX_NAME}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "cuisines" ? "e.g. Ethiopian" : "e.g. Halal"}
              className="rounded-xl text-sm"
            />
            <p className="text-xs text-muted-foreground">
              What vendors and customers see. {MAX_NAME - name.length} characters left.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tag-description">Description</Label>
            <Textarea
              id="tag-description"
              value={description}
              maxLength={MAX_DESCRIPTION}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One line explaining what this covers"
              className="resize-none rounded-xl text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Shown to vendors as a hint when they pick.
            </p>
          </div>

          {isEdit && (
            <div className="rounded-xl border border-border px-3.5 py-2.5">
              <p className="text-xs font-medium text-foreground">Code · {tag!.code}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The stable identifier. It never changes, so renaming is always safe.
              </p>
            </div>
          )}
        </div>

        <SheetFooter className="gap-2 border-t border-border px-5 py-4">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-1 gap-2" onClick={save} disabled={!canSave}>
              {saving
                ? <><Loader2 className="size-4 animate-spin" />Saving…</>
                : <><Save className="size-4" />{isEdit ? "Save changes" : `Add ${singular}`}</>}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
