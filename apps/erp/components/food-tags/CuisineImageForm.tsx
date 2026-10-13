"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { ImageUp, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/*
 * The cuisine picture, and the words a screen reader reads in its place.
 *
 * Uses the app's ONE upload pipeline, the same one the hero promotion uses:
 * ask for a presigned URL, PUT the file straight to storage, submit the
 * returned key. The file never passes through this app or the API process.
 *
 * ── The checks below are UX ONLY ───────────────────────────────────────────
 *
 * The server re-reads the bytes, decides what they really are and re-encodes
 * them — that re-encode is the sanitiser, not a resize. Every limit here is
 * enforced again where it counts. These exist so an admin finds out before
 * spending a minute uploading something that will be refused.
 *
 * Unlike the hero form, publishing happens IMMEDIATELY rather than on a save:
 * there is no other field to co-ordinate with, so a two-step "upload then
 * save" would only be a way to lose the upload.
 */

/* Mirrors the backend's ALLOWED_UPLOAD_MIME_TYPES. SVG is absent on both
 * sides, deliberately: it can carry script. */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"]
const MAX_BYTES = 10 * 1024 * 1024
/** The shared pipeline refuses a source whose shortest side is under this,
 *  even though a cuisine tile is only 512px — it stops a thumbnail someone
 *  found being passed off as artwork. */
const MIN_EDGE = 900

export function CuisineImageForm({
  slug,
  currentUrl,
  currentAlt,
}: {
  slug: string
  currentUrl: string | null
  currentAlt: string | null
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(currentUrl)
  const [alt, setAlt] = useState(currentAlt ?? "")

  async function handleFile(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Upload a JPEG, PNG, WebP or AVIF image.")
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error("That image is larger than 10MB.")
      return
    }

    const tooSmall = await new Promise<boolean>((resolve) => {
      const probe = new window.Image()
      probe.onload = () => resolve(Math.min(probe.width, probe.height) < MIN_EDGE)
      probe.onerror = () => resolve(false)
      probe.src = URL.createObjectURL(file)
    })
    if (tooSmall) {
      toast.error(`That image is too small — its shortest side must be at least ${MIN_EDGE}px.`)
      return
    }

    setBusy(true)
    try {
      const presigned = await fetch("/api/food-tags/cuisines/image/presign", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ contentType: file.type }),
      })
      const presignBody = await presigned.json()
      if (!presigned.ok) throw new Error(presignBody?.message ?? "Could not prepare the upload")

      const { uploadUrl, storageKey } = presignBody.data ?? presignBody

      const put = await fetch(uploadUrl, {
        method : "PUT",
        headers: { "Content-Type": file.type },
        body   : file,
      })
      if (!put.ok) throw new Error("The upload did not complete")

      const published = await fetch(`/api/food-tags/cuisines/${slug}/image`, {
        method : "PUT",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ originalImageKey: storageKey, imageAlt: alt.trim() || null }),
      })
      const publishBody = await published.json()
      if (!published.ok) throw new Error(publishBody?.message ?? "Could not publish the image")

      setPreview(URL.createObjectURL(file))
      toast.success("Image published", {
        description: "Cropped to 512px square and converted to WebP.",
      })
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function saveAlt() {
    setBusy(true)
    try {
      const res = await fetch(`/api/food-tags/cuisines/${slug}/image`, {
        method : "PUT",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ imageAlt: alt.trim() || null }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.message ?? "Could not save the description")
      toast.success("Description saved")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  async function removeImage() {
    setBusy(true)
    try {
      const res = await fetch(`/api/food-tags/cuisines/${slug}/image`, { method: "DELETE" })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.message ?? "Could not remove the image")
      setPreview(null)
      setAlt("")
      toast.success("Image removed")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-4">
        {/* A CIRCLE, because that is exactly how the storefront renders it —
            a square preview would hide that the subject gets cropped. */}
        <div className="relative size-28 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
          {preview ? (
            <Image src={preview} alt="" fill sizes="112px" className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ImageUp className="size-6" />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFile(file)
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ImageUp className="size-3.5" />}
              {preview ? "Replace image" : "Upload image"}
            </Button>
            {preview && (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={removeImage}>
                <Trash2 className="size-3.5" />
                Remove
              </Button>
            )}
          </div>

          <div className="max-w-md space-y-1 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Where this appears:</span> a small
              circular tile in the &quot;What are you craving?&quot; row on the storefront, about
              72&nbsp;pixels across.
            </p>
            <p>
              Square, at least 900&nbsp;px on its shortest side, JPEG, PNG, WebP or AVIF, under
              10&nbsp;MB. It is cropped from the CENTRE to a 512&nbsp;px square and re-encoded as
              WebP, so keep the food centred and leave room around it.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-md space-y-1.5">
        <Label htmlFor="cuisine-alt">Image description</Label>
        <div className="flex gap-2">
          <Input
            id="cuisine-alt"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            placeholder="e.g. A bowl of steaming ramen with a soft-boiled egg"
            disabled={busy || !preview}
          />
          <Button type="button" size="sm" variant="outline" disabled={busy || !preview} onClick={saveAlt}>
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Read aloud in place of the photo. Describe what is in it, not the cuisine — the name is
          already beside the tile.
        </p>
      </div>
    </div>
  )
}
