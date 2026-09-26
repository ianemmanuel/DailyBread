import { backendFetch } from "@/lib/api/server"
import { FALLBACK_HERO } from "@/constants/home/hero-fallback"

/*
 * The hero's content — a BACKEND read, which is why it lives in lib/data and
 * not in constants/.
 *
 * ── Where data-fetching belongs in this app ────────────────────────────────
 *
 *   lib/data/*       a Server Component render. Direct backendFetch, with
 *                    `revalidate` and `tags` so the result is cached and the
 *                    backend can purge it on publish.
 *   app/api/**       a CLIENT component's fetch. The route handler holds the
 *                    Clerk token so the browser never sees it.
 *   constants/**     display copy with no I/O at all.
 *
 * Fetching THIS through our own route handler would be the wrong shape twice
 * over: a Server Component would make a second network hop to its own server,
 * and it would need an absolute URL — which means reading headers, which turns
 * a static route dynamic. Next's own documentation says the same: a Server
 * Component should fetch directly.
 *
 * ── What it resolves ───────────────────────────────────────────────────────
 *
 * Every promotion is the PLATFORM talking — a seasonal message, a new market,
 * an anniversary. The BACKEND picks the most specific one for the visitor's
 * location: their city, then their country, then the global default. The
 * client never chooses between candidates; it renders the one it was handed
 * (principle 1).
 *
 * A caller that passes no location matches nothing city- or country-scoped and
 * therefore gets the GLOBAL promotion. That is what the landing page does, and
 * it is the ordinary default rather than a special case.
 *
 * ── The fallback is per-PART, not all-or-nothing ───────────────────────────
 *
 * COPY and IMAGE fall back independently. A published promotion always has a
 * headline (the column is required) but may have no image yet — the schema
 * calls that "a legitimate seasonal message", and it is also what every
 * promotion looks like before the public bucket is provisioned. Falling back
 * wholesale there would replace real admin-authored copy with invented
 * marketing, which is the worse of the two outcomes by a long way.
 *
 * So: a promotion's copy is used whenever a promotion exists, and the built-in
 * photograph stands in only when that promotion carries no image. The built-in
 * hero entire is used only when nothing is scheduled anywhere, or the backend
 * cannot be reached. That is a real default rather than a hidden error — a
 * landing page with no hero is broken, and unlike a list of search results a
 * marketing slot has a meaningful "nothing scheduled" answer.
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

/*
 * What the hero renders.
 *
 * Only `headline` and `image` are guaranteed. Everything else is null when the
 * admin left it blank, and the component OMITS that part rather than
 * substituting something — an eyebrow invented by the storefront sitting above
 * a headline written by marketing is worse than no eyebrow.
 */
export interface HeroContent {
  eyebrow: string | null
  /** Shown in uppercase by `.heading-hero`; a brand-coloured full stop is appended. */
  headline: string
  lede: string | null
  image: HeroImage
  /** The promotion's call to action, rendered over the photograph. */
  cta: { label: string; href: string } | null
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

/**
 * The hero for a visitor at this location.
 *
 * `anonymous: true` is load-bearing, not an optimisation. It skips the Clerk
 * lookup entirely, which is what keeps the pages that call this STATIC —
 * reading auth or cookies in the render path would make every page in the app
 * dynamic. It is also honest: the hero is identical for everyone standing in
 * the same place, so the response is safe to cache and cannot leak between
 * visitors.
 *
 * Revalidated at 60s rather than cached forever. The backend purges the
 * `hero-promotion` tag on publish, archive and edit, so that path is instant;
 * the timed window only bounds the cases where NOTHING happened — a promotion
 * whose `startsAt` or `endsAt` simply passed, which fires no event at all.
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
      { anonymous: true, revalidate: 60, tags: ["hero-promotion"] },
    )
    promotion = data?.promotion ?? null
  } catch (err) {
    /* Logged, never swallowed silently — the page still renders, but a broken
     * backend must be visible in the server logs rather than looking like
     * "nothing is scheduled". */
    console.error("[hero] Could not resolve a promotion; using the built-in hero.", err)
    return FALLBACK_HERO
  }

  /* Nothing scheduled anywhere — a real answer, so the built-in hero stands. */
  if (!promotion) return FALLBACK_HERO

  return {
    /* NOT `?? FALLBACK_HERO.eyebrow`. An optional field the admin left blank is
     * a decision, not a gap to be filled with the storefront's own marketing —
     * the hero simply renders one line fewer. */
    eyebrow: promotion.eyebrow,
    headline: promotion.headline,
    lede: promotion.subheadline,
    /* Its own imagery when it has some; otherwise the built-in photograph,
     * carrying the alt text that actually describes THAT photo. */
    image: promotion.image
      ? {
          src: promotion.image.url,
          alt: promotion.image.alt ?? "",
          width: promotion.image.width ?? 1600,
          height: promotion.image.height ?? 1600,
          blurDataUrl: promotion.image.blurDataUrl,
        }
      : FALLBACK_HERO.image,
    /* Both halves or neither: a label with nowhere to go is a dead button, and
     * a link with no label cannot be rendered. The server validates that the
     * href is a path inside the storefront. */
    cta:
      promotion.ctaLabel && promotion.ctaHref
        ? { label: promotion.ctaLabel, href: promotion.ctaHref }
        : null,
  }
}
