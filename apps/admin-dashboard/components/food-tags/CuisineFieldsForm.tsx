"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

/*
 * The catalogue half of a cuisine — name and description.
 *
 * One component for CREATE and EDIT, because the two differ only in the verb
 * and where they land afterwards. Splitting them would mean maintaining the
 * same character limits and the same copy in two files.
 *
 * ── Why cuisines get pages while dietary tags keep the Sheet ───────────────
 *
 * A dietary tag is a name and a sentence; a Sheet is right for that. A cuisine
 * also carries a photograph that has to be uploaded, previewed and possibly
 * replaced — that does not fit in a side panel, and an upload that dies when a
 * sheet is dismissed is a bad trade. Same reasoning as hero promotions.
 *
 * ── The image is a SEPARATE step, deliberately ─────────────────────────────
 *
 * Creating lands on the edit page rather than accepting an image up front. The
 * upload has to attach to a row that exists, and the alternative — threading
 * cuisine-only imagery through the catalogue create that Cuisine and
 * DietaryTag share — would put dead branches in every dietary-tag call.
 */

const MAX_NAME = 60
const MAX_DESCRIPTION = 160

interface Props {
  /** Absent when creating. */
  cuisine?: {
    id: string
    slug: string
    code: string
    name: string
    description: string | null
  }
}

export function CuisineFieldsForm({ cuisine }: Props) {
  const router = useRouter()
  const isEdit = Boolean(cuisine)

  const [name, setName] = useState(cuisine?.name ?? "")
  const [description, setDescription] = useState(cuisine?.description ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedName = name.trim()
  const canSave = trimmedName.length > 0 && trimmedName.length <= MAX_NAME && !saving

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(
        isEdit ? `/api/food-tags/cuisines/${cuisine!.id}` : "/api/food-tags/cuisines",
        {
          method : isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({
            name       : trimmedName,
            description: description.trim() || undefined,
          }),
        },
      )
      const body = await res.json()
      if (!res.ok) {
        setError(body?.message ?? "Couldn't save")
        return
      }

      if (isEdit) {
        toast.success(`${trimmedName} updated`)
        router.refresh()
        return
      }

      /* Straight to the edit page so the picture can be added now, while the
       * admin is still thinking about this cuisine — rather than leaving a
       * catalogue entry that renders a blank tile until somebody notices. */
      const created = body?.data ?? body
      toast.success(`${trimmedName} added`, { description: "Now give it a picture." })
      router.push(`/food-tags/cuisines/${created?.slug ?? ""}/edit`)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="cuisine-name">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="cuisine-name"
          value={name}
          maxLength={MAX_NAME}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ethiopian"
          className="max-w-md rounded-xl text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Shown under the tile on the storefront and in the vendor picker. A word or two —{" "}
          {MAX_NAME - name.length} characters left.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cuisine-description">Description</Label>
        <Textarea
          id="cuisine-description"
          value={description}
          maxLength={MAX_DESCRIPTION}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One line explaining what this covers"
          className="max-w-md resize-none rounded-xl text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Optional, and internal — shown to vendors as a hint when they pick, never on the
          storefront.
        </p>
      </div>

      {isEdit && (
        <div className="max-w-md rounded-xl border border-border px-3.5 py-2.5">
          <p className="text-xs font-medium text-foreground">Code · {cuisine!.code}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The stable identifier. It never changes, so renaming is always safe.
          </p>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button onClick={save} disabled={!canSave} className="gap-2">
        {saving
          ? <><Loader2 className="size-4 animate-spin" />Saving…</>
          : <><Save className="size-4" />{isEdit ? "Save changes" : "Add cuisine"}</>}
      </Button>
    </div>
  )
}
