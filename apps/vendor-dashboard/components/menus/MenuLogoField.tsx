"use client"

import { useRef, useState } from "react"
import { ImagePlus, Loader2, RefreshCw, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  uploadMealImage, discardMealImage, validateImage, releasePreview, ALLOWED_IMAGE_LABEL, ALLOWED_IMAGE_TYPES,
} from "@/lib/menu/media"

/*
 * A menu's single image or logo, on the SAME upload pipeline as dish photos:
 * presign → PUT straight to R2's staging prefix → submit the key with the
 * form. The server decodes, re-encodes and publishes it when the menu is
 * saved, and refuses anything that is not this vendor's own upload.
 *
 * A replaced upload that was never saved is discarded at once; the saved logo
 * is only ever replaced by saving, never deleted from here.
 */

export interface MenuLogoValue {
  /** A staging key (new upload) or the saved logo's key (keep it). */
  storageKey: string
  url       : string | null
  isLocal   : boolean
}

export function MenuLogoField({
  value, onChange, disabled, error,
}: {
  value    : MenuLogoValue | null
  onChange : (value: MenuLogoValue | null) => void
  disabled?: boolean
  error?   : string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [localError, setLocalError] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    setLocalError(null)
    const invalid = validateImage(file)
    if (invalid) { setLocalError(invalid); return }
    setUploading(true)
    try {
      setProgress(0)
      const uploaded = await uploadMealImage(file, setProgress)
      // The upload it replaces, if never saved, has nowhere else to go.
      if (value?.isLocal) { releasePreview(value.url ?? ""); void discardMealImage(value.storageKey) }
      onChange({ storageKey: uploaded.storageKey, url: uploaded.previewUrl, isLocal: true })
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Upload failed. Please try again.")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const shown = error ?? localError

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
          {value?.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob preview or public master
            <img src={value.url} alt="Menu image" className="size-full object-contain" />
          ) : (
            <ImagePlus aria-hidden className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 space-y-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : value ? <RefreshCw className="size-4" /> : <ImagePlus className="size-4" />}
            {uploading ? `Uploading… ${progress}%` : value ? "Replace image" : "Upload image"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Required. A logo or a photo that represents this menu — {ALLOWED_IMAGE_LABEL}, at least 256 px on its
            shortest side.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          className="sr-only"
          aria-label="Upload the menu's image or logo"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
      </div>
      {shown && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="size-3.5" /> {shown}
        </p>
      )}
    </div>
  )
}
