import Image from "next/image"
import Link from "next/link"

import { getCategoriesContent } from "@/constants/home/categories-content"
import { SectionHeader } from "../SectionHeader"

/*
 * "What are you craving?" — a row of cuisine tiles on a full-width tinted band.
 *
 * Phones: one row you swipe sideways. Tablets: 4 per row. Desktop: all 8 in a
 * row. No arrow buttons: on screens wide enough to show arrows everything
 * already fits, and swiping on a phone needs no JavaScript.
 */
export async function Categories() {
  const { title, categories } = await getCategoriesContent()

  return (
    <section aria-labelledby="categories-title" className="full-bleed bg-surface-subtle">
      <div className="shell band-tight">
        <SectionHeader id="categories-title" title={title} href="/discover" linkLabel="All cuisines" />

        <ul className="rail -mx-4 px-4 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-8">
          {categories.map((category) => (
            <li key={category.slug} className="w-28 shrink-0 md:w-auto">
              <Link
                href={`/discover?category=${category.slug}`}
                className="surface-interactive group flex h-full flex-col items-center gap-3 px-3 py-4 text-center"
              >
                <span className="photo-frame photo-zoom size-16 rounded-full sm:size-18">
                  <Image
                    src={category.image}
                    alt=""
                    fill
                    sizes="72px"
                    className="object-cover"
                  />
                </span>
                <span className="text-sm font-medium text-foreground">{category.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
