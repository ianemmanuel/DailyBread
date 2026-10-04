"use client"

import { useState, type KeyboardEvent } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, ImageOff, Soup } from "lucide-react"
import type { MenuImage } from "@repo/types/customer-app"

import { photoLabel, stepIndex } from "@/lib/meal/gallery"
import { cn } from "@/lib/utils"

/*
 * The meal's photographs: one large frame and a row of thumbnails.
 *
 * - ORDER is the server's (main photo first); nothing here sorts.
 * - The frame is a fixed square, so switching photos — or a photo failing to
 *   load — never moves the page. Each master is a stable public URL with a
 *   blur placeholder sent beside it.
 * - Only the main photo loads eagerly (it is the page's LCP); the others load
 *   when chosen, and thumbnails are requested at thumbnail width.
 * - Keyboard: every thumbnail is a button, Previous/Next are buttons, and the
 *   arrow keys step while focus is anywhere inside the gallery. The current
 *   position is announced politely.
 */
export function MealGallery({ images, name }: { images: MenuImage[]; name: string }) {
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const count = images.length

  if (count === 0) {
    return (
      <div className="photo-frame relative flex aspect-square w-full items-center justify-center rounded-2xl">
        <Soup aria-hidden className="size-12 text-primary/30" />
        <span className="sr-only">No photo of this dish yet</span>
      </div>
    )
  }

  const current = images[Math.min(index, count - 1)]!
  const go = (delta: number) => setIndex((i) => stepIndex(i, delta, count))
  const markFailed = (url: string) => setFailed((prev) => new Set(prev).add(url))

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (count <= 1) return
    if (event.key === "ArrowRight") { event.preventDefault(); go(1) }
    else if (event.key === "ArrowLeft") { event.preventDefault(); go(-1) }
  }

  return (
    <section aria-roledescription="carousel" aria-label={`Photos of ${name}`} className="space-y-3" onKeyDown={onKeyDown}>
      <div className="photo-frame relative aspect-square w-full overflow-hidden rounded-2xl">
        {failed.has(current.url) ? (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageOff aria-hidden className="size-10 text-primary/30" />
            <span className="text-sm">This photo couldn&apos;t load</span>
          </div>
        ) : (
          <Image
            key={current.url}
            src={current.url}
            alt={photoLabel(name, index, count)}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 50vw"
            quality={80}
            /* Only the first photo is the LCP; one chosen later loads on demand. */
            priority={index === 0}
            placeholder="blur"
            blurDataURL={current.blurDataUrl}
            onError={() => markFailed(current.url)}
          />
        )}

        {count > 1 && (
          <>
            <GalleryArrow side="left" label="Previous photo" onClick={() => go(-1)} />
            <GalleryArrow side="right" label="Next photo" onClick={() => go(1)} />
            <span
              aria-hidden
              className="absolute right-3 bottom-3 rounded-full bg-background/85 px-2.5 py-1 text-xs font-medium text-foreground tabular-nums shadow-sm backdrop-blur"
            >
              {index + 1} / {count}
            </span>
          </>
        )}
      </div>

      {count > 1 && (
        <>
          <p aria-live="polite" className="sr-only">{photoLabel(name, index, count)}</p>
          {/* Padded so the selected ring and focus ring are not clipped by the
              rail's horizontal scroll. */}
          <ul className="rail p-1" aria-label="Choose a photo">
            {images.map((image, i) => (
              <li key={image.url} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Show photo ${i + 1} of ${count}`}
                  aria-current={i === index ? "true" : undefined}
                  className={cn(
                    "photo-frame relative block size-20 cursor-pointer overflow-hidden rounded-xl outline-none transition sm:size-24",
                    "ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring",
                    i === index ? "ring-2 ring-primary" : "opacity-75 hover:opacity-100",
                  )}
                >
                  {failed.has(image.url) ? (
                    <span className="flex size-full items-center justify-center">
                      <ImageOff aria-hidden className="size-5 text-primary/30" />
                    </span>
                  ) : (
                    <Image
                      src={image.url}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="96px"
                      quality={60}
                      placeholder="blur"
                      blurDataURL={image.blurDataUrl}
                      onError={() => markFailed(image.url)}
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function GalleryArrow({ side, label, onClick }: { side: "left" | "right"; label: string; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "absolute top-1/2 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full",
        "bg-background/85 text-foreground shadow-sm backdrop-blur transition hover:bg-background",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  )
}
