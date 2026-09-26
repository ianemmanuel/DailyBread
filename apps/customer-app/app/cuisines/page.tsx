import type { Metadata } from "next"

import { CuisineTile } from "@/components/cuisines/CuisineTile"
import { getCuisineDirectory } from "@/lib/data/cuisines"

/*
 * `/cuisines` — every cuisine on DailyBread, globally.
 *
 * The catalogue, not supply: a cuisine is listed because the platform has it,
 * not because anyone near the reader cooks it (that is a city's question —
 * `/city/<slug>/cuisines`). Each tile opens the cuisine's own page, which says
 * which cities carry it.
 *
 * Static on the catalogue's hour, like `/city`: it reads no cookie and no
 * session, and it is an SEO surface ("<cuisine> delivery").
 */

export const revalidate = 3600

export const metadata: Metadata = {
  title      : "Cuisines",
  description: "Every cuisine you can order on DailyBread, from kitchens in the cities we deliver to.",
  alternates : { canonical: "/cuisines" },
}

export default async function CuisinesPage() {
  const state = await getCuisineDirectory()

  return (
    <div className="band-tight space-y-8">
      <header className="max-w-2xl space-y-2">
        <p className="eyebrow">Explore</p>
        <h1 className="heading-xl text-balance">Cuisines on DailyBread</h1>
        <p className="lede">
          Every kind of food our kitchens cook. Pick one to see where you can order it.
        </p>
      </header>

      {state.kind === "error" ? (
        <p className="surface px-6 py-8 text-sm text-muted-foreground">
          {state.message} Please try again shortly.
        </p>
      ) : state.cuisines.length === 0 ? (
        <p className="surface px-6 py-8 text-sm text-muted-foreground">
          Our cuisine catalogue is being put together. Check back soon.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {state.cuisines.map((cuisine) => (
            <li key={cuisine.id}>
              <CuisineTile cuisine={cuisine} href={`/cuisines/${cuisine.slug}`} size="lg" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
