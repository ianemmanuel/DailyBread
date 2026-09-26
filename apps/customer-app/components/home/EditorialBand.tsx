import Image from "next/image"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { getEditorialContent } from "@/constants/home/editorial-content"

/*
 * "Discover something new" — a full-width photograph with copy over it.
 *
 * Dark in BOTH themes on purpose: it's the one moody break in the page. The
 * text sits on a gradient that darkens the photo — from the bottom on phones
 * (text at the bottom), from the left on wider screens (text on the left).
 */
export async function EditorialBand() {
  const { title, body, cta, image } = await getEditorialContent()

  return (
    <section aria-labelledby="editorial-title" className="full-bleed relative isolate overflow-hidden bg-deep">
      <Image
        src={image.src}
        alt={image.alt}
        fill
        sizes="100vw"
        className="-z-10 object-cover object-[65%_50%]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-linear-to-t from-deep via-deep/70 to-deep/10 md:bg-linear-to-r md:from-deep md:via-deep/70 md:to-transparent"
      />

      <div className="shell flex min-h-104 flex-col justify-end py-12 md:min-h-120 md:justify-center lg:py-20">
        <div className="max-w-md space-y-5 text-deep-foreground">
          <h2 id="editorial-title" className="heading-xl font-bold uppercase">
            {title}
          </h2>
          <p className="text-base leading-relaxed text-deep-foreground/85 sm:text-lg">{body}</p>
          <Button asChild size="lg" className="h-11 rounded-full px-6">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
