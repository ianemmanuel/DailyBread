"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { ImageUp, Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

/*
 * The hero image picker.
 *
 * Uses the app's one upload pipeline: ask for a presigned URL, PUT the file
 * straight to storage, keep the returned key, submit the key with the form.
 * The file never passes through this app or the API process.
 *
 * The checks below are UX ONLY. The server re-reads the bytes, decides what
 * they really are, and re-encodes them — a declared content type is just a
 * claim, and every limit here is enforced again where it counts.
 */

/* Mirrors the backend's ALLOWED_UPLOAD_MIME_TYPES. SVG is absent on both
 * sides, deliberately: it can carry script. */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"]
const ACCEPT_ATTR = ACCEPTED.join(",")
const MAX_BYTES = 10 * 1024 * 1024
/** The backend refuses anything whose shortest side is under this, because the
 *  1600px square would have to be upscaled and would look soft. */
const MIN_EDGE = 900

export function HeroImageField({
  currentUrl,
  onUploaded,
  onCleared,
}: {
  currentUrl: string | null
  /** The PRIVATE storage key of the original. The server turns it into the
   *  published square when the form is saved. */
  onUploaded: (storageKey: string, previewUrl: string) => void
  onCleared: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(currentUrl)

  async function handleFile(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Upload a JPEG, PNG, WebP or AVIF image.")
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error("That image is larger than 10MB.")
      return
    }

    /* Checked here as well as on the server so the admin finds out before
     * spending time uploading a file that will be refused. */
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
      const res = await fetch("/api/marketing/hero-promotions/image/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, fileSize: file.size }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.message ?? "Could not prepare the upload")

      const { uploadUrl, storageKey } = body.data ?? body
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!put.ok) throw new Error("The upload did not complete")

      /* A local preview rather than a round trip — the published URL only
       * exists after the server has processed the image on save. */
      const localUrl = URL.createObjectURL(file)
      setPreview(localUrl)
      onUploaded(storageKey, localUrl)
      toast.success("Image uploaded — it is cropped and published when you save")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-4">
        {/* Square, because that is exactly the shape the storefront renders
            and the server crops to. */}
        <div className="relative size-32 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
          {preview ? (
            <Image src={preview} alt="" fill sizes="128px" className="object-cover" unoptimized />
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
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFile(file)
            }}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ImageUp className="size-3.5" />}
              {preview ? "Replace" : "Upload image"}
            </Button>
            {preview && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setPreview(null)
                  onCleared()
                }}
              >
                <X className="size-3.5" />
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            JPEG, PNG, WebP or AVIF, up to 10MB. Square works best — we crop to
            a 1600&nbsp;&times;&nbsp;1600 centre square and convert it for the web.
          </p>
        </div>
      </div>
    </div>
  )
}
