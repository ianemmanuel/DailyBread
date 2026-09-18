import Image from "next/image"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { getCtaContent } from "@/constants/home/cta-content"

/*
 * The closing call to action on a full-width brand-tinted band, just above the
 * footer. The two round food photos either side are decoration, so they only
 * appear on large screens where there is empty space for them.
 */
export async function CtaBand() {
  const { before, highlight, body, cta, decorImages } = await getCtaContent()

  return (
    <section aria-labelledby="cta-title" className="full-bleed relative overflow-hidden bg-surface-brand">
      {decorImages.map((src, index) => (
        <div
          key={src}
          aria-hidden
          className={
            "photo-frame absolute top-1/2 hidden size-40 -translate-y-1/2 rounded-full border-4 border-background shadow-xl lg:block xl:size-48 " +
            (index === 0 ? "left-[6%] -rotate-6" : "right-[6%] rotate-6")
          }
        >
          <Image src={src} alt="" fill sizes="192px" className="object-cover" />
        </div>
      ))}

      <div className="shell band flex flex-col items-center gap-6 text-center">
        <h2 id="cta-title" className="heading-hero max-w-2xl text-balance">
          {before} <span className="text-primary-text">{highlight}</span>.
        </h2>
        <p className="lede max-w-md">{body}</p>
        <Button asChild size="lg" className="h-12 rounded-full px-8">
          <Link href={cta.href}>{cta.label}</Link>
        </Button>
      </div>
    </section>
  )
}
