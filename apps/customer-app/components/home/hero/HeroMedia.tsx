import Image from "next/image"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import type { HeroContent } from "@/lib/data/hero"

/*
 * The hero photograph and the call-to-action card that floats over it.
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
  cta,
}: Pick<HeroContent, "image" | "cta">) {
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

      {/*
        The promotion's call to action, floating over the lower edge of the
        photograph — the shape design.png gives this slot.

        It carries the admin's own label and nothing else. It used to render a
        "Featured" kicker above the label, which was the storefront inventing a
        word about content it did not write; the label already says what the
        thing is. Keeping it to one line also means a long label truncates
        instead of reflowing the card over the food.

        Positioned bottom-left because the hero image spec reserves the bottom
        left third for exactly this — see the image guidance in CLAUDE.md.
      */}
      {cta && (
        <Link
          href={cta.href}
          className="surface-interactive absolute right-4 bottom-4 left-4 flex items-center gap-3 p-4 sm:right-auto sm:max-w-xs lg:bottom-10 lg:-left-8"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {cta.label}
          </span>
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <ArrowUpRight className="size-4" />
          </span>
        </Link>
      )}
    </div>
  )
}
