import Image from "next/image"
import Link from "next/link"
import { Clock, Star } from "lucide-react"

import { getKitchensContent } from "@/constants/home/kitchens-content"
import { formatEta } from "@/lib/format/money"
import { SectionHeader } from "../SectionHeader"

/*
 * "From your neighbourhood" — four kitchen cards on a full-width tinted band.
 * Same responsive pattern as Popular: swipe row on phones, 2 columns on
 * tablets, 4 on desktop.
 */
export async function NeighbourhoodKitchens() {
  const { title, seeAllHref, kitchens } = await getKitchensContent()

  return (
    <section aria-labelledby="kitchens-title" className="full-bleed bg-surface-subtle">
      <div className="shell band-tight">
        <SectionHeader id="kitchens-title" title={title} href={seeAllHref} />

        <ul className="rail -mx-4 px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          {kitchens.map((kitchen) => (
            <li key={kitchen.id} className="w-[72%] shrink-0 sm:w-auto">
              <Link href={kitchen.href} className="surface-interactive group flex h-full flex-col overflow-hidden">
                <div className="photo-frame photo-zoom aspect-16/10">
                  <Image
                    src={kitchen.image}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 72vw"
                    className="object-cover"
                  />
                </div>

                <div className="flex flex-1 flex-col gap-1 p-4">
                  <h3 className="font-sans text-base font-semibold tracking-normal">{kitchen.name}</h3>
                  <p className="text-xs text-muted-foreground">{kitchen.cuisines.join(" · ")}</p>

                  <div className="mt-auto flex items-center gap-4 pt-3 text-sm">
                    <span className="flex items-center gap-1 font-medium">
                      <Star aria-hidden className="size-4 fill-primary text-primary" />
                      <span className="sr-only">Rated</span>
                      {kitchen.rating.toFixed(1)}
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock aria-hidden className="size-3.5" />
                      {formatEta(kitchen.eta)}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
