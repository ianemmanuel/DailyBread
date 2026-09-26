/*
 * The two per-DEVICE cookies behind market navigation. Parsers only — no
 * `next/headers` — so the browser and the server share one definition of what
 * a malformed value means.
 *
 * ── db_delivery: one choice PER MARKET ─────────────────────────────────────
 *
 * The old cookie held ONE location for the whole device, which is why
 * switching city had to be special-cased and why selecting a Mombasa address
 * silently threw away the Nairobi one. A delivery choice belongs to a place,
 * so it is stored per market:
 *
 *   { v: 2, markets: { "nairobi-ke": { mode: "deliver", target: { kind: "address", addressId } },
 *                      "mombasa-ke": { mode: "browse",  target: { kind: "pin", … } } } }
 *
 *   mode    what the customer asked THIS market to do: narrow to a delivery
 *           point, or browse everything. Browsing keeps the target, so
 *           "Deliver to Westlands" is one click away again — browsing is a
 *           view, never an account change.
 *   target  WHERE, when delivering. A saved address travels as its id only:
 *           the server resolves it against the caller's own address book on
 *           every request, so the cookie holds no coordinates or label that
 *           could outlive the address or leak to the next person who signs in
 *           on this browser. An anonymous pin has no row to point at, so its
 *           point and label ARE the record.
 *
 * Keys are city slugs, written ONLY by route handlers from the backend's own
 * resolution of a point or address — never from a slug the client supplied.
 *
 * ── db_market: the market this device was last in ─────────────────────────
 *
 * Display and landing only: the navbar chip's name, and where `/continue` and
 * the doorways send someone the account has nothing to say about.
 *
 * Neither cookie carries a serviceability verdict — coverage changes when an
 * admin edits a zone, so it is re-resolved on every read.
 */

export const DELIVERY_COOKIE = "db_delivery"
export const LAST_MARKET_COOKIE = "db_market"

/** A year: a delivery choice is a convenience, not a session. */
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** Enough for anyone who genuinely orders in several cities, small enough that
 *  the cookie stays well under a kilobyte. Oldest choice is dropped first. */
const MAX_MARKETS = 12

export type DeliveryTarget =
  | { kind: "address"; addressId: string }
  | { kind: "pin"; latitude: number; longitude: number; label: string }

export interface MarketChoice {
  mode  : "deliver" | "browse"
  target: DeliveryTarget | null
  /** Epoch ms of the last change, for evicting the oldest market. */
  at    : number
}

export interface DeliveryCookie {
  v      : 2
  markets: Record<string, MarketChoice>
}

export interface LastMarket {
  slug: string
  name: string
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/

/**
 * Read a JSON cookie value from EITHER side.
 *
 * Next's cookie APIs percent-encode a value on write and decode it on read,
 * so the server sees plain JSON; `document.cookie` in the browser sees the
 * encoded form. Serialising with our own `encodeURIComponent` as well (the old
 * behaviour) double-encoded it, which the server tolerated and the browser
 * could never parse — so every browser-side reader silently read "nothing".
 * Values are now written as plain JSON and read here, plain first.
 */
function readJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return JSON.parse(decodeURIComponent(raw))
  }
}

export function isCitySlug(value: unknown): value is string {
  return typeof value === "string" && SLUG.test(value)
}

export function emptyDeliveryCookie(): DeliveryCookie {
  return { v: 2, markets: {} }
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed.slice(0, max)
}

function parseTarget(value: unknown): DeliveryTarget | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  if (raw.kind === "address") {
    const addressId = text(raw.addressId, 64)
    return addressId ? { kind: "address", addressId } : null
  }
  if (raw.kind === "pin") {
    const { latitude, longitude } = raw
    if (
      typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    ) return null
    return { kind: "pin", latitude, longitude, label: text(raw.label, 120) ?? "Your pinned spot" }
  }
  return null
}

/** Anything malformed reads as "nothing chosen" — never as an error, and never
 *  half-trusted. A v1 cookie from before this shape simply reads empty. */
export function parseDeliveryCookie(raw: string | undefined): DeliveryCookie {
  if (!raw) return emptyDeliveryCookie()
  try {
    const parsed = readJson(raw) as Partial<DeliveryCookie>
    if (parsed?.v !== 2 || !parsed.markets || typeof parsed.markets !== "object") {
      return emptyDeliveryCookie()
    }
    const markets: Record<string, MarketChoice> = {}
    for (const [slug, value] of Object.entries(parsed.markets).slice(0, MAX_MARKETS)) {
      if (!isCitySlug(slug) || !value || typeof value !== "object") continue
      const choice = value as Partial<MarketChoice>
      if (choice.mode !== "deliver" && choice.mode !== "browse") continue
      const target = parseTarget(choice.target)
      /* Delivering with nowhere to deliver to is not a choice. */
      if (choice.mode === "deliver" && !target) continue
      markets[slug] = {
        mode: choice.mode,
        target,
        at  : typeof choice.at === "number" && Number.isFinite(choice.at) ? choice.at : 0,
      }
    }
    return { v: 2, markets }
  } catch {
    return emptyDeliveryCookie()
  }
}

/** Plain JSON — Next's cookie API does the percent-encoding. */
export function serializeDeliveryCookie(cookie: DeliveryCookie): string {
  return JSON.stringify(cookie)
}

/** Set one market's choice, evicting the oldest market when over the cap. */
export function withChoice(
  cookie: DeliveryCookie,
  slug  : string,
  choice: Omit<MarketChoice, "at">,
): DeliveryCookie {
  const markets = { ...cookie.markets, [slug]: { ...choice, at: Date.now() } }
  const slugs = Object.keys(markets)
  if (slugs.length > MAX_MARKETS) {
    slugs
      .filter((s) => s !== slug)
      .sort((a, b) => markets[a]!.at - markets[b]!.at)
      .slice(0, slugs.length - MAX_MARKETS)
      .forEach((s) => delete markets[s])
  }
  return { v: 2, markets }
}

/**
 * Forget a deleted address everywhere it was chosen. A market that was
 * delivering to it loses its choice entirely and falls back to its default;
 * one that was browsing keeps browsing, with nothing to return to.
 */
export function withoutAddress(cookie: DeliveryCookie, addressId: string): DeliveryCookie {
  const markets: Record<string, MarketChoice> = {}
  for (const [slug, choice] of Object.entries(cookie.markets)) {
    const pointsAtIt = choice.target?.kind === "address" && choice.target.addressId === addressId
    if (!pointsAtIt) markets[slug] = choice
    else if (choice.mode === "browse") markets[slug] = { ...choice, target: null }
  }
  return { v: 2, markets }
}

export function parseLastMarket(raw: string | undefined): LastMarket | null {
  if (!raw) return null
  try {
    const parsed = readJson(raw) as Partial<LastMarket>
    const name = text(parsed?.name, 80)
    return isCitySlug(parsed?.slug) && name ? { slug: parsed.slug, name } : null
  } catch {
    return null
  }
}

export function serializeLastMarket(market: LastMarket): string {
  return JSON.stringify({ slug: market.slug, name: market.name.slice(0, 80) })
}

/** Shared by every writer so the two cookies can never drift in scope. Not
 *  httpOnly: the navbar reads `db_market` in the browser for its label. */
export const COOKIE_OPTIONS = {
  maxAge  : COOKIE_MAX_AGE,
  path    : "/",
  sameSite: "lax" as const,
  secure  : process.env.NODE_ENV === "production",
  httpOnly: false,
}
