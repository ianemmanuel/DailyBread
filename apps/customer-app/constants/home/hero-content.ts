import { backendFetch } from "@/lib/api/server"
import { pexels } from "./placeholder-data"

/*
 * The hero's content.
 *
 * Resolved by the BACKEND, which picks the most specific promotion for the
 * visitor's location — their city, then their country, then the global
 * default. The client never chooses between candidates; it renders the one it
 * was handed (principle 1).
 *
 * When there is no promotion anywhere, or the backend cannot be reached, the
 * storefront falls back to the built-in hero below. That is a real default
 * rather than an error state being hidden: a landing page with no hero is a
 * broken landing page, and a marketing slot has a meaningful "nothing
 * scheduled" answer in a way a list of search results does not.
 *
 * PLACEHOLDERS in the fallback: the offer and the "10,000+" figure are made up
 * for layout and must not ship. They disappear the moment a real promotion is
 * published.
 */

export interface HeroImage {
  src: string
  alt: string
  /** Intrinsic size of the source file. Promotion imagery is 1600 x 1600. */
  width: number
  height: number
  /** A tiny blurred stand-in, stored with the promotion. A remote image cannot
   *  be statically imported, so this is the only way to blur up. */
  blurDataUrl?: string | null
}

export interface HeroContent {
  eyebrow: string
  /** Shown in uppercase by `.heading-hero`; a brand-coloured full stop is appended. */
  headline: string
  lede: string
  searchPlaceholder: string
  image: HeroImage
  offer: { label: string; title: string; href: string } | null
  socialProof: { avatars: { src: string }[]; text: string } | null
}

/** What GET /customer/v1/hero-promotion returns. `promotion` is null when
 *  nothing is scheduled anywhere — a real answer, not a failure. */
interface HeroPromotionResponse {
  promotion: {
    eyebrow: string | null
    headline: string
    subheadline: string | null
    ctaLabel: string | null
    ctaHref: string | null
    image: {
      url: string
      width: number | null
      height: number | null
      blurDataUrl: string | null
      alt: string | null
    } | null
  } | null
}

const SEARCH_PLACEHOLDER = "Enter your delivery address"

const FALLBACK_HERO: HeroContent = {
  eyebrow: "Good food, made simple",
  headline: "Good food, right when you want it",
  lede: "Discover meals from great local kitchens, delivered fresh to your door.",
  searchPlaceholder: SEARCH_PLACEHOLDER,
  image: {
    src: pexels(1640772, 1600, 1600),
    alt: "A bowl of roasted sweet potato wedges topped with beans, fresh salsa and yoghurt",
    width: 1600,
    height: 1600,
  },
  offer: {
    label: "This week's offer",
    title: "20% off your first meal plan",
    href: "/meal-plans",
  },
  socialProof: {
    avatars: [774909, 1222271, 1239291, 2379004].map((id) => ({ src: pexels(id, 160, 160) })),
    text: "Join 10,000+ happy food lovers",
  },
}

/**
 * The hero for a visitor at this location.
 *
 * `anonymous: true` is load-bearing, not an optimisation. It skips the Clerk
 * lookup entirely, which is what keeps `/` a STATIC route — reading auth or
 * cookies in the render path would make every page in the app dynamic. It is
 * also honest: the hero is identical for everyone standing in the same place,
 * so the response is safe to cache and cannot leak between visitors.
 *
 * Revalidated rather than cached forever: an admin publishing a promotion
 * should see it appear without a deploy.
 *
 * The path carries `/api` because THIS app's BACKEND_API_URL has no suffix,
 * unlike the ERP's — same convention as the discovery reads.
 */
export async function getHeroContent(location?: {
  cityId?: string | null
  countryId?: string | null
}): Promise<HeroContent> {
  const query = new URLSearchParams()
  if (location?.cityId) query.set("cityId", location.cityId)
  if (location?.countryId) query.set("countryId", location.countryId)
  const suffix = query.size ? `?${query.toString()}` : ""

  let promotion: HeroPromotionResponse["promotion"] = null
  try {
    const data = await backendFetch<HeroPromotionResponse>(
      `/api/customer/v1/hero-promotion${suffix}`,
      { anonymous: true, revalidate: 300, tags: ["hero-promotion"] },
    )
    promotion = data?.promotion ?? null
  } catch (err) {
    /* Logged, never swallowed silently — the page still renders, but a broken
     * backend must be visible in the server logs rather than looking like
     * "nothing is scheduled". */
    console.error("[hero] Could not resolve a promotion; using the built-in hero.", err)
    return FALLBACK_HERO
  }

  if (!promotion?.image) return FALLBACK_HERO

  return {
    eyebrow: promotion.eyebrow ?? FALLBACK_HERO.eyebrow,
    headline: promotion.headline,
    lede: promotion.subheadline ?? FALLBACK_HERO.lede,
    searchPlaceholder: SEARCH_PLACEHOLDER,
    image: {
      src: promotion.image.url,
      alt: promotion.image.alt ?? "",
      width: promotion.image.width ?? 1600,
      height: promotion.image.height ?? 1600,
      blurDataUrl: promotion.image.blurDataUrl,
    },
    /* The promotion's call to action becomes the card floating over the photo —
     * the one place the hero already has for "here is the thing on offer". */
    offer:
      promotion.ctaLabel && promotion.ctaHref
        ? { label: "Featured", title: promotion.ctaLabel, href: promotion.ctaHref }
        : null,
    /* Deliberately dropped for a real promotion: the fallback's follower count
     * is invented, and inventing numbers about the business for the people it
     * serves is not something to ship. */
    socialProof: null,
  }
}
