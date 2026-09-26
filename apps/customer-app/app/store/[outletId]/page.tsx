import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { StoreHero } from "@/components/storefront/StoreHero"
import { StoreHours } from "@/components/storefront/StoreHours"
import { StoreMenu } from "@/components/storefront/StoreMenu"
import { getStorefront } from "@/lib/data/storefront"

/*
 * One storefront — the page every feed card, every places row and every shared
 * link has been pointing at.
 *
 * ── Why this route is flat, and not under a market ─────────────────────────
 *
 * `/city/[citySlug]/places/[outletId]` would keep the market bar overhead, and
 * it was rejected: an outlet id carries no city, so nothing here could verify
 * that the slug in the URL is the market the kitchen actually sits in. A
 * mismatched pair would render a storefront under the wrong market's name —
 * the exact "the URL is not the location" mistake the whole geography model
 * exists to prevent. The id alone claims nothing, and the hero's back link
 * goes through the `/discover` doorway, which resolves the customer's OWN
 * market rather than one inferred from a link they were sent.
 *
 * ── The menu is read-only, deliberately ────────────────────────────────────
 *
 * The cart and the option sheet were recovered out of this page rather than
 * back into it: there is no `Order` model yet, so an "Add to cart" would price
 * a meal with nowhere to send it. See `MenuItemCard` — it is the honest half,
 * and it is the half that makes every card in the app lead somewhere real.
 *
 * Per request rather than cached: prices, offers, open-now and availability
 * are all live, and the photography arrives as short-lived signed URLs that a
 * cached page would hand out dead.
 */

export const dynamic = "force-dynamic"

interface Props { params: Promise<{ outletId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { outletId } = await params
  const store = await getStorefront(outletId)
  if (!store) return { title: "Place not found" }

  return {
    title      : store.displayName,
    description: store.tagline ?? store.description ?? `Order from ${store.displayName} on DailyBread.`,
    openGraph  : {
      title      : store.displayName,
      description: store.tagline ?? "",
      /* A signed URL, so it expires. Acceptable for a share card and not for
         anything durable — the alternative is a public derivative, which is a
         decision for the media pipeline rather than for this page. */
      images     : store.coverUrl ? [store.coverUrl] : [],
    },
    /* Live prices, live availability, and a URL a crawler reaches without a
       location. The city pages are this app's SEO surface. */
    robots     : { index: false, follow: true },
  }
}

export default async function StorePage({ params }: Props) {
  const { outletId } = await params
  /* Deduped with generateMetadata's call — same request, same cache entry. */
  const store = await getStorefront(outletId)

  /*
   * Not found, suspended, unpublished, or in an area that cannot sell all
   * arrive here identically, because the backend refuses to distinguish them
   * (principle 6: an opaque id must not be probeable). One honest not-found,
   * with no invented reason.
   */
  if (!store) notFound()

  return (
    <div className="pb-16">
      <StoreHero store={store} />

      <div className="shell grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
        <StoreMenu store={store} />

        {/* Sticky beside the menu on a wide screen; above it on a phone, where
            "are they open?" is the question asked before the food is read. */}
        <aside className="order-first lg:order-last lg:sticky lg:top-24">
          <StoreHours store={store} />
        </aside>
      </div>
    </div>
  )
}
