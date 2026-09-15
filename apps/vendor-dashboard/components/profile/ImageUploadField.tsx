"use client"

import { useRef, useState } from "react"
import { ImagePlus, Loader2, Trash2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  uploadProfileImage, discardProfileImage, releasePreview, validateImage,
  ALLOWED_IMAGE_TYPES, ALLOWED_IMAGE_LABEL,
} from "@/lib/profile/media"
import type { ProfileMediaKind } from "@repo/types/vendor-app"

/*
 * One image slot — the logo or the cover.
 *
 * Upload happens on pick, not on submit: the vendor sees the image land, and
 * the form only ever carries a storage key. Removing an image they just
 * uploaded deletes it from the bucket straight away, so an abandoned upload
 * never becomes a file nothing can reach. Same contract as the application
 * documents and the payout proof.
 */

export interface ImageValue {
  storageKey: string
  /** A signed URL from the server, or a local object URL for a fresh upload. */
  url       : string
  /** True while this is a local preview, so removal knows to revoke the URL. */
  isLocal   : boolean
}

interface Props {
  kind       : Extract<ProfileMediaKind, "logo" | "cover">
  label      : string
  hint       : string
  value      : ImageValue | null
  onChange   : (value: ImageValue | null) => void
  /** Aspect treatment — a logo is square, a cover is a wide banner. */
  shape      : "square" | "wide"
  disabled?  : boolean
}

export function ImageUploadField({ kind, label, hint, value, onChange, shape, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [error, setError]         = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    const invalid = validateImage(file)
    if (invalid) { setError(invalid); return }

    setError(null)
    setUploading(true)
    setProgress(0)
    try {
      const uploaded = await uploadProfileImage(kind, file, setProgress)
      // Replacing: the previous upload is now unreferenced. Discard it here
      // rather than waiting for the save, so an abandoned form leaks nothing.
      if (value?.isLocal) {
        releasePreview(value.url)
        void discardProfileImage(value.storageKey)
      }
      onChange({ storageKey: uploaded.storageKey, url: uploaded.previewUrl, isLocal: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.")
    } finally {
      setUploading(false)
      // Clear the input so picking the same file again still fires onChange.
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  function remove() {
    if (!value) return
    /*
     * Only a not-yet-saved upload is deleted from storage here. One that is
     * already part of the saved profile stays put until the vendor saves the
     * removal — the backend refuses to delete it anyway, which is what stops a
     * stale tab wiping a live logo.
     */
    if (value.isLocal) {
      releasePreview(value.url)
      void discardProfileImage(value.storageKey)
    }
    onChange(null)
    setError(null)
  }

  const frame = shape === "square"
    ? "size-28 rounded-2xl"
    : "h-32 w-full rounded-2xl sm:h-36"

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
        <span className="text-xs text-[var(--muted-foreground)]">Optional</span>
      </div>

      <div className={cn("flex gap-3", shape === "wide" && "flex-col")}>
        {/* Preview / dropzone */}
        <div
          className={cn(
            "relative shrink-0 overflow-hidden border border-dashed border-[var(--border)] bg-[var(--muted)]/25",
            frame,
          )}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.url} alt={`${label} preview`} className="size-full object-cover" />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 text-[var(--muted-foreground)]">
              <ImagePlus className="size-5" />
              <span className="text-[11px]">No image</span>
            </div>
          )}

          {uploading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/55 text-white">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-[11px] tabular-nums">{progress}%</span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
            >
              {value ? "Replace" : "Upload"}
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-[var(--destructive)] hover:text-[var(--destructive)]"
                disabled={disabled || uploading}
                onClick={remove}
              >
                <Trash2 className="size-3.5" />Remove
              </Button>
            )}
          </div>
          <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">{hint}</p>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--destructive)]">
          <AlertCircle className="size-3.5 shrink-0" />{error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        className="hidden"
        aria-label={`Upload ${label}`}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <span className="sr-only">{ALLOWED_IMAGE_LABEL}, up to 5MB</span>
    </div>
  )
}
