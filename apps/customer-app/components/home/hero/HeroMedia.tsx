import Image from "next/image"
import Link from "next/link"
import { ArrowUpRight, Tag } from "lucide-react"

import type { HeroContent } from "@/constants/home/hero-content"

/*
 * The hero photograph and the offer card that floats over it.
 *
 * The photo is the landing page's largest element, so it loads eagerly at high
 * fetch priority. Not `preload`: on phones the photo sits below the text and
 * search, and preloading an image that starts off-screen wastes the bandwidth
 * the text needs.
 *
 * The frame is a fixed square, so the page never shifts while the photo loads,
 * and `sizes` matches the rendered width: at most ~600px beside the text on
 * desktop, up to 512px wide on a phone.
 */
export function HeroMedia({
  image,
  offer,
}: Pick<HeroContent, "image" | "offer">) {
  return (
    <div className="relative isolate mx-auto w-full max-w-lg lg:max-w-none">
      {/* A soft brand-coloured glow behind the photo. */}
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[3rem] bg-primary/20 blur-3xl" />

      <div className="photo-frame aspect-square rounded-3xl border border-border shadow-xl">
        <Image
          src={image.src}
          alt={image.alt}
          fill
          loading="eager"
          fetchPriority="high"
          quality={90}
          sizes="(min-width: 1280px) 600px, (min-width: 1024px) 50vw, (min-width: 512px) 512px, 100vw"
          className="object-cover"
          /* Only when the promotion carries one. A remote image cannot be
             statically imported, so the placeholder is stored beside it at
             upload time; passing `blur` without a data URL throws. */
          {...(image.blurDataUrl
            ? { placeholder: "blur" as const, blurDataURL: image.blurDataUrl }
            : {})}
        />
      </div>

      {offer && (
        <Link
          href={offer.href}
          className="surface-interactive absolute right-4 bottom-4 left-4 flex items-center gap-3 p-3 sm:right-auto sm:max-w-xs lg:bottom-10 lg:-left-8"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Tag className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-muted-foreground">{offer.label}</span>
            <span className="block truncate text-sm font-semibold text-foreground">{offer.title}</span>
          </span>
          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}
    </div>
  )
}
