import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, ChevronRight, MapPin } from "lucide-react"

import { getCuisineDetail, getCuisineDirectory } from "@/lib/data/cuisines"
import { getMarketsSafe } from "@/lib/data/markets"

/*
 * `/cuisines/[cuisineSlug]` — one cuisine, GLOBALLY: what it is, and which of
 * our cities carry it. The first version of the cuisine details page, kept
 * deliberately thin.
 *
 * ── Why this page names cities instead of listing places ───────────────────
 *
 * Places are a property of a market (and, when delivering, of a point), so
 * the page that lists them is market-scoped: today that is the city's discover
 * page filtered by this cuisine, and later a `/city/<slug>/cuisines/<slug>`
 * page. This URL stays the same for everyone who opens it — a shared link
 * never shows one reader Nairobi's kitchens and the next Berlin's.
 *
 * "Where to find it" = countries that switched the cuisine on (from the
 * backend, customer-open countries only) × the cities we operate in. It is an
 * enablement, not a supply claim: a city is listed because the cuisine is
 * available there, and its link opens that market's filtered list, which says
 * honestly if nobody is cooking it right now.
 *
 * Static per cuisine on the catalogue's hour.
 */

export const revalidate = 3600

type Params = { cuisineSlug: string }

/** One page per catalogue entry. Resilient: an unreachable backend at build
 *  time means the pages render on demand instead of failing the build, and a
 *  cuisine added later renders on its first visit. */
export async function generateStaticParams(): Promise<Params[]> {
  const state = await getCuisineDirectory()
  return state.kind === "ok" ? state.cuisines.map((c) => ({ cuisineSlug: c.slug })) : []
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { cuisineSlug } = await params
  const detail = await getCuisineDetail(cuisineSlug)
  if (!detail) return { title: "Cuisine not found" }
  const { cuisine } = detail
  return {
    title      : `${cuisine.name} food`,
    description: cuisine.description ?? `Order ${cuisine.name} food from kitchens on DailyBread.`,
    alternates : { canonical: `/cuisines/${cuisine.slug}` },
  }
}

export default async function CuisineDetailPage({ params }: { params: Promise<Params> }) {
  const { cuisineSlug } = await params
  const [detail, markets] = await Promise.all([getCuisineDetail(cuisineSlug), getMarketsSafe()])
  if (!detail) notFound()

  const { cuisine, countryIds } = detail
  const enabled = new Set(countryIds)
  const where = markets.filter((market) => enabled.has(market.countryId))

  return (
    <div className="band-tight space-y-10">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/cuisines" className="rounded-sm hover:text-foreground hover:underline">Cuisines</Link>
        <ChevronRight aria-hidden className="size-3.5" />
        <span className="text-foreground">{cuisine.name}</span>
      </nav>

      <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <span className="photo-frame relative flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-full sm:size-36">
          {cuisine.image ? (
            <Image
              src={cuisine.image.url}
              alt={cuisine.image.alt ?? ""}
              fill
              sizes="144px"
              priority
              className="object-cover"
              {...(cuisine.image.blurDataUrl
                ? { placeholder: "blur" as const, blurDataURL: cuisine.image.blurDataUrl }
                : {})}
            />
          ) : (
            <span aria-hidden className="flex size-full items-center justify-center bg-primary/15 text-4xl font-semibold text-primary-text">
              {cuisine.name.charAt(0)}
            </span>
          )}
        </span>
        <div className="max-w-2xl space-y-2">
          <h1 className="heading-xl text-balance">{cuisine.name}</h1>
          {cuisine.description && <p className="lede">{cuisine.description}</p>}
        </div>
      </header>

      <section aria-labelledby="where-title" className="space-y-4">
        <h2 id="where-title" className="heading-lg">Where to find it</h2>
        {where.length === 0 ? (
          <p className="surface px-6 py-8 text-sm text-muted-foreground">
            {cuisine.name} isn&apos;t available in any of our cities yet.{" "}
            <Link href="/city" className="font-medium text-primary-text hover:underline">See where we deliver</Link>
          </p>
        ) : (
          <div className="space-y-6">
            {where.map((market) => (
              <div key={market.countryId} className="space-y-3">
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {market.countryName}
                </h3>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {market.cities.map((city) => (
                    <li key={city.id}>
                      <Link
                        href={`/city/${city.slug}/discover?cuisine=${cuisine.id}`}
                        className="surface-interactive group flex items-center gap-3 px-4 py-3.5"
                      >
                        <MapPin aria-hidden className="size-4 shrink-0 text-primary-text" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-foreground">{cuisine.name} in {city.name}</span>
                          <span className="block text-xs text-muted-foreground">See the places cooking it</span>
                        </span>
                        <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
