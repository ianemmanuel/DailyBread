import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getStorefront } from "@/lib/customer/discovery"
import { StoreHero } from "@/components/storefront/StoreHero"
import { StoreMenu } from "@/components/storefront/StoreMenu"
import { StoreHours } from "@/components/storefront/StoreHours"

/*
 * One storefront. SSR, and short — every piece of markup lives in a component.
 *
 * Per request rather than cached: prices, offers, open-now and availability are
 * all live, and the menu photography arrives as short-lived signed URLs that a
 * cached page would hand out dead.
 */
export const dynamic = "force-dynamic"

interface Props { params: Promise<{ outletId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { outletId } = await params
  const store = await getStorefront(outletId)
  if (!store) return { title: "Restaurant not found" }

  return {
    title      : store.displayName,
    description: store.tagline ?? store.description ?? `Order from ${store.displayName} on DailyBread.`,
    openGraph  : {
      title      : store.displayName,
      description: store.tagline ?? "",
      images     : store.coverUrl ? [store.coverUrl] : [],
    },
  }
}

export default async function StorePage({ params }: Props) {
  const { outletId } = await params
  const store = await getStorefront(outletId)

  /*
   * The backend returns 404 for an outlet that does not exist AND for one that
   * is suspended, unpublished or in an area that cannot sell — an opaque id
   * must not be probeable. So this page shows one honest "not found" rather
   * than inventing a reason it was never told.
   */
  if (!store) notFound()

  return (
    <div className="pb-24">
      <StoreHero store={store} />

      <div className="shell grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
        <StoreMenu store={store} />

        {/* Sticky beside the menu on a wide screen; below it on a phone, where
            hours matter less than the food. */}
        <aside className="order-first lg:order-last lg:sticky lg:top-24">
          <StoreHours store={store} />
        </aside>
      </div>
    </div>
  )
}
