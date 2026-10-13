"use client"

import { useState, type KeyboardEvent } from "react"
import { ChevronLeft, ChevronRight, ImageOff, Maximize2 } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/*
 * A dish's photographs for an admin inspecting it: one large frame, a row of
 * thumbnails, arrows and arrow keys — the customer app's MealGallery pattern —
 * plus "inspect" to open the selected photo at full size, because judging a
 * photo is half of what moderation is. Order is the server's (main photo
 * first). Plain <img>: these are the processed public WebP masters the ERP
 * already renders this way; nothing here touches image storage.
 */
export interface GalleryImage { url: string | null; width: number; height: number }

export function ListingGallery({ images, name }: { images: GalleryImage[]; name: string }) {
  const shown = images.filter((i): i is GalleryImage & { url: string } => !!i.url)
  const [index, setIndex]     = useState(0)
  const [zoomed, setZoomed]   = useState(false)
  const [failed, setFailed]   = useState<ReadonlySet<string>>(() => new Set())
  const count = shown.length

  if (count === 0) {
    return (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-xl bg-muted text-muted-foreground">
        <ImageOff className="h-6 w-6" />
        <span className="text-xs">No photo</span>
      </div>
    )
  }

  const current = shown[Math.min(index, count - 1)]!
  const go = (delta: number) => setIndex((i) => (i + delta + count) % count)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (count <= 1) return
    if (e.key === "ArrowRight") { e.preventDefault(); go(1) }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1) }
  }
  const label = `Photo ${index + 1} of ${count} of ${name}`

  return (
    <div className="space-y-2" onKeyDown={onKeyDown} aria-roledescription="carousel" aria-label={`Photos of ${name}`}>
      <div className="group relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted">
        {failed.has(current.url) ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <ImageOff className="h-6 w-6" />
            <span className="text-xs">This photo couldn&apos;t load</span>
          </div>
        ) : (
          <button type="button" onClick={() => setZoomed(true)} className="block h-full w-full cursor-zoom-in" aria-label={`Inspect ${label}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- public derivative */}
            <img src={current.url} alt={label} className="h-full w-full object-cover"
              onError={() => setFailed((f) => new Set(f).add(current.url))} />
          </button>
        )}
        <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-medium text-foreground opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100">
          <Maximize2 className="h-3 w-3" /> Inspect
        </span>
        {count > 1 && (
          <>
            <Arrow side="left" onClick={() => go(-1)} />
            <Arrow side="right" onClick={() => go(1)} />
            <span className="absolute bottom-3 right-3 rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground shadow-sm backdrop-blur">
              {index + 1} / {count}
            </span>
          </>
        )}
      </div>

      {count > 1 && (
        <ul className="flex gap-2 overflow-x-auto p-0.5" aria-label="Choose a photo">
          {shown.map((img, i) => (
            <li key={img.url} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1} of ${count}`}
                aria-current={i === index ? "true" : undefined}
                className={cn(
                  "block h-14 w-16 cursor-pointer overflow-hidden rounded-lg bg-muted outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
                  i === index ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- public derivative */}
                <img src={img.url} alt="" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={zoomed} onOpenChange={setZoomed}>
        <DialogContent className="max-w-[min(92vw,1100px)] border-0 bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">{label}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element -- public derivative, full size */}
          <img src={current.url} alt={label} className="max-h-[85vh] w-full rounded-xl object-contain" />
          <p className="text-center text-xs text-white/80">
            {current.width} × {current.height}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      className={cn(
        "absolute top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full",
        "bg-background/85 text-foreground shadow-sm backdrop-blur transition hover:bg-background",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        side === "left" ? "left-2" : "right-2",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
