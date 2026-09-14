import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, Star, Clock, Bike, MapPin, UtensilsCrossed, ShoppingBag } from "lucide-react"
import { formatDeliveryFee, formatEta, formatDistance, formatMoneyCompact } from "@/lib/format/money"
import type { Storefront } from "@repo/types/customer-app"

/*
 * The top of a storefront.
 *
 * A Server Component — nothing here is interactive except the back link.
 *
 * The cover photograph carries the appetite, so it gets real height and a
 * bottom scrim rather than a flat band: white text over an unknown photo is
 * only legible if something guarantees contrast, and a scrim is that guarantee
 * for every image rather than for the ones we happened to test.
 */
export function StoreHero({ store }: { store: Storefront }) {
  const eta = formatEta(store.eta)

  return (
    <header>
      <div className="photo-frame relative h-52 w-full sm:h-72">
        {store.coverUrl ? (
          <Image
            src={store.coverUrl}
            alt=""
            fill
            className="object-cover"
            sizes="100vw"
            quality={90}
            // The hero IS the largest contentful paint on this page.
            priority
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <UtensilsCrossed className="size-12 text-[var(--primary)]/30" />
          </div>
        )}

        {/* Guarantees the back button and any overlaid text stay legible on
            every photograph, not just dark ones. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--deep)]/75 via-[var(--deep)]/10 to-[var(--deep)]/25" />

        <div className="shell absolute inset-x-0 top-4">
          <Link
            href="/"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/50"
          >
            <ArrowLeft className="size-4" />
            All restaurants
          </Link>
        </div>

        {!store.isAcceptingOrders && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center pb-4">
            <span className="chip-solid">Closed right now &middot; you can still browse the menu</span>
          </div>
        )}
      </div>

      {/*
        * The logo overlaps the photo above it — the convention every
        * marketplace uses, because it ties the identity to the imagery instead
        * of stacking two unrelated blocks.
        */}
      <div className="shell -mt-10 relative">
        <div className="flex items-end gap-4">
          <div className="photo-frame size-20 shrink-0 rounded-2xl border-4 border-[var(--card)] shadow-md sm:size-24">
            {store.logoUrl ? (
              <Image src={store.logoUrl} alt="" fill className="object-cover" sizes="96px" quality={90} />
            ) : (
              <div className="flex size-full items-center justify-center bg-[var(--primary-subtle)]">
                <UtensilsCrossed className="size-7 text-[var(--primary-subtle-fg)]" />
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-3 pb-6">
          <div className="space-y-1">
            <h1 className="heading-xl text-[var(--foreground)]">{store.displayName}</h1>
            {store.tagline && (
              <p className="text-sm text-[var(--muted-foreground)]">{store.tagline}</p>
            )}
          </div>

          {store.cuisines.length > 0 && (
            <div className="rail">
              {store.cuisines.map((cuisine) => (
                <span key={cuisine.id} className="chip-brand shrink-0">{cuisine.name}</span>
              ))}
              {store.dietaryTags.map((tag) => (
                <span key={tag.id} className="chip-muted shrink-0">{tag.name}</span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--muted-foreground)]">
            {store.reviewCount > 0 && (
              <span className="flex items-center gap-1 font-medium text-[var(--foreground)]">
                <Star className="size-4 fill-[var(--primary)] text-[var(--primary)]" />
                {store.rating.toFixed(1)}
                <span className="font-normal text-[var(--muted-foreground)]">
                  ({store.reviewCount})
                </span>
              </span>
            )}
            {eta && <span className="flex items-center gap-1.5"><Clock className="size-4" />{eta}</span>}
            <span className="flex items-center gap-1.5">
              <Bike className="size-4" />
              {formatDeliveryFee(store.deliveryFeeMinor, store.currency)}
            </span>
            {store.minimumOrderMinor !== null && (
              <span className="flex items-center gap-1.5">
                <ShoppingBag className="size-4" />
                {formatMoneyCompact(store.minimumOrderMinor, store.currency)} minimum
              </span>
            )}
            {store.distanceMeters !== null && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4" />
                {formatDistance(store.distanceMeters)}
              </span>
            )}
          </div>

          {store.offers.length > 0 && (
            <div className="rail pt-1">
              {store.offers.map((offer) => (
                <span key={offer.id} className="chip-offer shrink-0">{offer.label}</span>
              ))}
            </div>
          )}

          {store.description && (
            <p className="max-w-2xl pt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
              {store.description}
            </p>
          )}
        </div>
      </div>
    </header>
  )
}
