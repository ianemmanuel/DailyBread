"use client"

import { useRef, useState } from "react"
import { ImagePlus, Loader2, X, Star, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  uploadMealImage, discardMealImage, releasePreview, validateImage,
  ALLOWED_IMAGE_TYPES, ALLOWED_IMAGE_LABEL,
} from "@/lib/menu/media"

/*
 * The meal's photos.
 *
 * Upload happens on pick, not on submit: the vendor watches the photo land and
 * the form only ever carries storage keys. Removing one they just uploaded
 * deletes it from the bucket straight away, so an abandoned form leaks nothing.
 * Same contract as the profile images, the payout proof and the application
 * documents — a vendor should never meet a second upload UX.
 *
 * THE FIRST PHOTO IS THE ONE CUSTOMERS SEE. That is stated on the tile rather
 * than hidden in a separate "main image" control, because ordering and choosing
 * the hero are the same decision — which is how Uber Eats, Square and Toast all
 * present it. Two controls would also let a vendor pick a hero that is not in
 * the gallery, and then the cleanup pass could orphan an image the meal shows.
 */

export interface MealImageValue {
  storageKey: string
  /** A signed URL from the server, or a local object URL for a fresh upload. */
  url       : string | null
  /** True while this is a local preview, so removal knows to revoke the URL. */
  isLocal   : boolean
}

interface Props {
  value    : MealImageValue[]
  onChange : (value: MealImageValue[]) => void
  max      : number
  disabled?: boolean
  error?   : string
}

export function MealImageGallery({ value, onChange, max, disabled, error }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [localError, setLocalError] = useState<string | null>(null)

  const full = value.length >= max

  async function pick(files: FileList | null) {
    if (!files || files.length === 0) return
    const room = max - value.length
    const batch = Array.from(files).slice(0, room)

    setLocalError(null)
    setUploading(true)
    try {
      const added: MealImageValue[] = []
      for (const file of batch) {
        const invalid = validateImage(file)
        if (invalid) { setLocalError(invalid); continue }
        setProgress(0)
        const uploaded = await uploadMealImage(file, setProgress)
        added.push({ storageKey: uploaded.storageKey, url: uploaded.previewUrl, isLocal: true })
      }
      if (added.length > 0) onChange([...value, ...added])
      if (files.length > room) {
        setLocalError(`Only ${max} photos per meal — the extra ones weren't added.`)
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Upload failed. Please try again.")
    } finally {
      setUploading(false)
      // Clear the input so picking the same file again still fires onChange.
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  function remove(index: number) {
    const image = value[index]
    if (!image) return
    /*
     * Only a not-yet-saved upload is deleted from storage here. One that is
     * already on the saved meal stays put until the vendor saves the removal —
     * the backend refuses to delete it anyway, which is what stops a stale tab
     * wiping a live photo.
     */
    if (image.isLocal) {
      releasePreview(image.url)
      void discardMealImage(image.storageKey)
    }
    onChange(value.filter((_, i) => i !== index))
  }

  /** Promoting to hero is a reorder, not a separate field. */
  function makeHero(index: number) {
    if (index === 0) return
    const next = [...value]
    const [picked] = next.splice(index, 1)
    if (picked) next.unshift(picked)
    onChange(next)
  }

  const shown = error ?? localError

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {value.map((image, index) => (
          <div
            key={image.storageKey}
            className={cn(
              "group relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted",
              index === 0 ? "border-primary ring-2 ring-primary/20" : "border-border/70",
            )}
          >
            {image.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob preview or signed R2 URL
              <img src={image.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImagePlus className="h-5 w-5" />
              </div>
            )}

            {index === 0 && (
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground shadow-sm">
                <Star className="h-3 w-3 fill-current" />
                Main photo
              </span>
            )}

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              {index !== 0 ? (
                <button
                  type="button"
                  onClick={() => makeHero(index)}
                  disabled={disabled}
                  className="cursor-pointer rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-white"
                >
                  Make main
                </button>
              ) : <span />}
              <button
                type="button"
                onClick={() => remove(index)}
                disabled={disabled}
                aria-label="Remove photo"
                className="cursor-pointer rounded-full bg-white/90 p-1 text-destructive transition-colors hover:bg-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        {!full && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-xs font-medium">{progress}%</span>
              </>
            ) : (
              <>
                <ImagePlus className="h-5 w-5" />
                <span className="text-xs font-medium">Add photo</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />

      <p className="text-xs text-muted-foreground">
        {ALLOWED_IMAGE_LABEL}, up to 5MB each. Up to {max} photos — the first one is what customers see in the
        menu list.
      </p>

      {shown && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {shown}
        </p>
      )}
    </div>
  )
}
