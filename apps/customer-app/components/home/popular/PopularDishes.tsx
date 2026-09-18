import Image from "next/image"
import Link from "next/link"
import { Clock, Star } from "lucide-react"

import { getPopularContent } from "@/constants/home/popular-content"
import { formatEta, formatMoneyCompact } from "@/lib/format/money"
import { SectionHeader } from "../SectionHeader"

/*
 * "Popular right now" — four dish cards.
 *
 * Phones: a sideways-swipe row with the next card peeking in, so it is obvious
 * there is more. Tablet: 2 columns. Desktop: 4 columns.
 *
 * No heart/save button yet: saving needs an account and a backend endpoint, and
 * a button that does nothing is worse than no button.
 */
export async function PopularDishes() {
  const { title, seeAllHref, currency, dishes } = await getPopularContent()

  return (
    <section aria-labelledby="popular-title" className="band-tight">
      <SectionHeader id="popular-title" title={title} href={seeAllHref} />

      <ul className="rail -mx-4 px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {dishes.map((dish) => (
          <li key={dish.id} className="w-[72%] shrink-0 sm:w-auto">
            <Link href={dish.href} className="surface-interactive group flex h-full flex-col overflow-hidden">
              <div className="photo-frame photo-zoom aspect-4/3">
                <Image
                  src={dish.image}
                  alt={dish.name}
                  fill
                  sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 72vw"
                  className="object-cover"
                />
              </div>

              <div className="flex flex-1 flex-col gap-1 p-4">
                <p className="text-xs text-muted-foreground">{dish.kitchen}</p>
                <h3 className="clamp-1 font-sans text-base font-semibold tracking-normal">{dish.name}</h3>

                <div className="mt-auto flex items-center gap-3 pt-3 text-sm">
                  <span className="flex items-center gap-1 font-medium">
                    <Star aria-hidden className="size-4 fill-primary text-primary" />
                    <span className="sr-only">Rated</span>
                    {dish.rating.toFixed(1)}
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock aria-hidden className="size-3.5" />
                    {formatEta(dish.eta)}
                  </span>
                  <span className="price ml-auto font-semibold">
                    {formatMoneyCompact(dish.priceMinor, currency)}
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
