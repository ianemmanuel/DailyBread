/*
 * The customer-facing wire contract.
 *
 * Every date is an ISO string, never a Date — same rule as the vendor session
 * types. Every money figure is integer MINOR UNITS and carries its currency
 * alongside, because this app spans markets whose currencies have different
 * scales (KES/USD 2, UGX/JPY 0, KWD 3) and a bare number is unreadable without
 * one.
 */

import type { ConsumerStatus, ServiceabilityStatus, DiscoverySort } from "../enums/customer"
import type { MenuItemUnavailableReason, CartProblemCode } from "../enums/customer"

// ─── Identity ────────────────────────────────────────────────────────────────

export interface CustomerAccount {
  id       : string
  email    : string
  fullName : string | null
  phone    : string | null
  countryId: string | null
  status   : ConsumerStatus
}

export interface CustomerSessionData {
  customer : CustomerAccount
  addresses: CustomerAddress[]
  /** "Your cities": every operating city the customer chose or holds an
   *  address in. The default city first, then most recently selected. */
  markets  : CustomerMarket[]
  /** Where signing in lands. Explicit choice, else the most recently selected
   *  city, else the newest address's city. Null for a brand-new customer. */
  defaultCitySlug : string | null
  /** The DEFAULT CITY's default address. Anything scoped to one market must
   *  read that market's `defaultAddressId` instead. */
  defaultAddressId: string | null
}

/**
 * One of the customer's cities, with its defaults already resolved by the
 * backend (customer.markets.ts). The frontend never re-derives any of it.
 */
export interface CustomerMarket {
  cityId          : string
  citySlug        : string
  cityName        : string
  countryId       : string
  /** The customer's default city — exactly one market has it whenever the
   *  list is non-empty. */
  isDefault       : boolean
  /** This city's default delivery address, validated against where each pin
   *  resolves today. Null only when the city holds no address. */
  defaultAddressId: string | null
  addressCount    : number
  /** When the customer last chose this city. Null for a city known only
   *  because an address resolves into it. */
  lastSelectedAt  : string | null
}

export interface SelectCustomerMarketRequest {
  /** Also make this the default city. Never implied by selecting. */
  isDefault?: boolean
}

export interface CustomerMarketsResult {
  markets        : CustomerMarket[]
  defaultCitySlug: string | null
}

// ─── Addresses ───────────────────────────────────────────────────────────────

export interface CustomerAddress {
  id          : string
  label       : string | null
  addressLine1: string
  addressLine2: string | null
  /** As the customer typed it, for printing. The city that DECIDES anything is
   *  `serviceability.cityName`, resolved from the pin. */
  city        : string
  postalCode  : string | null
  /** Derived from the pin by the server, never echoed back from the request. */
  countryId   : string
  latitude    : number
  longitude   : number
  /** The default address FOR THE CITY this pin resolves into. Defaults are
   *  per city — one in Nairobi, another in Mombasa. */
  isDefault   : boolean
  createdAt   : string
  /** Resolved on every READ, never stored: coverage changes when an admin
   *  edits a zone, so a saved verdict would go quietly stale. Always present,
   *  because an address without a pin can no longer be saved. */
  serviceability: Serviceability
}

export interface UpsertCustomerAddressRequest {
  label?       : string | null
  addressLine1 : string
  addressLine2?: string | null
  /** For printing only; it does not decide the address's geography. */
  city         : string
  postalCode?  : string | null
  /** OPTIONAL, and only ever a cross-check. The server derives the country
   *  from the coordinates; a supplied id that disagrees is rejected. */
  countryId?   : string | null
  latitude     : number
  longitude    : number
  isDefault?   : boolean
}

// ─── Serviceability ──────────────────────────────────────────────────────────

export interface Serviceability {
  status              : ServiceabilityStatus
  isServiceable       : boolean
  zoneId              : string | null
  zoneName            : string | null
  platformDelivers    : boolean
  vendorMaySelfDeliver: boolean
  /** Which of the platform's cities the point resolved into. Null when it fell
   *  outside every operating city. */
  cityId              : string | null
  cityName            : string | null
  /** The city's URL slug, so a resolved point can be sent straight to that
   *  city's page without a second lookup. */
  citySlug            : string | null
  /** The country the resolved city belongs to. Needed by the storefront to ask
   *  for a COUNTRY-scoped hero promotion: without it, country scoping is
   *  unreachable from the frontend no matter how well it is modelled. */
  countryId           : string | null
}

export interface CheckServiceabilityRequest {
  latitude : number
  longitude: number
}

// ─── Markets ─────────────────────────────────────────────────────────────────

/*
 * Where the platform operates, as a visitor is allowed to see it.
 *
 * This is the MARKET dimension — coarse, cacheable, and identical for everyone.
 * It drives merchandising (which promotion, which city page) and the city
 * picker. It is NOT a delivery location: ordering needs a point, because
 * coverage is resolved by point-in-polygon against a city boundary and a city
 * id is not a point.
 */
export interface MarketCity {
  id      : string
  name    : string
  slug    : string
  timezone: string
}

export interface Market {
  countryId  : string
  countryName: string
  countrySlug: string
  countryCode: string
  cities     : MarketCity[]
}

export interface MarketsResult {
  markets: Market[]
}

/**
 * One city, with the named areas the platform operates in.
 *
 * `areas` is NAMES ONLY, and that is a boundary rather than a shortcut. It
 * deliberately carries no zone level, no operational status, no geometry and
 * no delivery mode: a customer needs to know whether we reach them, not how
 * the operation is arranged behind that. Whether a courier or the kitchen
 * itself brings the food is our business, and `ZoneLevel` is internal
 * vocabulary that would also map out where the platform is expanding.
 *
 * An area appears when the zone can be LISTED to customers at all
 * (`canListOnDemand`). A zone that is merely paused stays listed — a pause is
 * temporary and measured in hours, while this list answers the durable
 * question of where we operate. Someone standing inside a paused zone is told
 * so by their own serviceability verdict, which is the right place for it.
 */
export interface CityMarket {
  city   : MarketCity
  country: {
    id  : string
    name: string
    slug: string
    code: string
  }
  areas: string[]
  /** Where to POINT A MAP when this city's location page opens, and nothing
   *  else. See CityViewport. */
  viewport: CityViewport
}

/**
 * A map viewport, and **never a delivery location**.
 *
 * `center` is the city's stored centroid — a vertex average of its boundary,
 * which can land outside a concave city and, in this database, outside every
 * operating zone of a city we plainly serve. It exists so a map opens looking
 * at the right place; the delivery point is whatever the customer then puts
 * their pin on, and it must always be established explicitly.
 *
 * `bounds` is the boundary's bounding box, for fitting the initial view. It is
 * NOT a coverage claim: a bounding box contains land outside the city, and
 * membership is decided by point-in-polygon on the server.
 *
 * Both are null when the city has no boundary drawn — such a city cannot be
 * listed to customers at all, so in practice they are always present here.
 */
export interface CityViewport {
  center: { latitude: number; longitude: number } | null
  bounds: { north: number; south: number; east: number; west: number } | null
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

/** A cuisine as the storefront shows it. A narrow allowlist: no status, no
 *  storage key, no ids of other things — see customer.catalog.service.ts. */
export interface CustomerCuisine {
  id   : string
  slug : string
  name : string
  /** Admin-written copy. Null when the catalogue entry has none yet. */
  description: string | null
  /** Null when no picture has been uploaded yet, or when the public bucket is
   *  unconfigured. The tile renders name-only rather than breaking. */
  image: {
    url        : string
    width      : number | null
    height     : number | null
    blurDataUrl: string | null
    alt        : string | null
  } | null
}

export interface CustomerCuisinesResult {
  cuisines: CustomerCuisine[]
  /** Every matching cuisine, not just this page — so a directory can never
   *  present a truncated list as the whole catalogue. */
  total   : number
  page    : number
  pageSize: number
}

/**
 * One cuisine, for its details page. `countryIds` are the countries OPEN TO
 * CUSTOMERS where it is switched on — the frontend intersects them with the
 * market list to say which cities carry it. Nothing about supply: that is a
 * property of a place and a point, and belongs to the city-scoped reads.
 */
export interface CustomerCuisineDetail {
  cuisine   : CustomerCuisine
  countryIds: string[]
}

// ─── Money ───────────────────────────────────────────────────────────────────

export interface CustomerCurrency {
  code           : string
  symbol         : string
  /** Never assume 2. */
  minorUnitDigits: number
}

/** A price and what it breaks down to. Always computed server-side. */
export interface PriceBreakdown {
  /** What the customer pays for this. */
  grossMinor: number
  /** The part that is tax. Null when the market has configured no rate, which
   *  is different from a market that charges zero. */
  taxMinor  : number | null
  netMinor  : number | null
  taxLabel  : string | null
  taxRate   : string | null
  taxInclusive: boolean
}

// ─── Discovery ───────────────────────────────────────────────────────────────

export interface DeliveryEstimate {
  minMinutes: number
  maxMinutes: number
}

/** One card in the feed. */
export interface DiscoveryOutlet {
  outletId    : string
  vendorId    : string
  name        : string
  /** The storefront's own display name, which is what a customer recognises;
   *  falls back to the outlet name when the vendor has not set one. */
  displayName : string
  tagline     : string | null
  logoUrl     : string | null
  coverUrl    : string | null
  cuisines    : Array<{ id: string; name: string; slug: string }>
  rating      : number
  reviewCount : number
  isFeatured  : boolean
  /** NULL when the answer was computed without a delivery point — city-wide
   *  browsing. Distance and an ETA are functions of coordinates, and inventing
   *  either would be a number we cannot stand behind (principle 11). */
  distanceMeters: number | null
  eta         : DeliveryEstimate | null
  isOpenNow   : boolean
  /** Null means the outlet has not set one, which is not the same as free. */
  deliveryFeeMinor : number | null
  minimumOrderMinor: number | null
  currency    : CustomerCurrency
  /** The best offer running on this outlet right now, for the feed badge.
   *  Null when nothing applies this minute. */
  offer       : DiscoveryOffer | null
  /** True when the platform carries the food; false when the vendor does.
   *  NULL while browsing city-wide: it is the CUSTOMER's zone that decides,
   *  and without a point there is no zone to ask. */
  platformDelivers: boolean | null
}

export interface DiscoveryOffer {
  id        : string
  /** Customer-facing summary — "20% off" or "KSh 200 off over KSh 1,500". */
  label     : string
  percentBps: number | null
}

export interface DiscoveryFilters {
  search?    : string
  cuisineIds?: string[]
  dietaryTagIds?: string[]
  openNow?   : boolean
  hasOffer?  : boolean
  freeDelivery?: boolean
  maxDeliveryMinutes?: number
  minRating? : number
  sort?      : DiscoverySort
  page?      : number
  pageSize?  : number
}

export interface DiscoveryResult {
  serviceability: Serviceability
  outlets : DiscoveryOutlet[]
  total   : number
  page    : number
  pageSize: number
  /** The cuisines actually present in this result set, so the filter bar only
   *  ever offers a choice that can match something. */
  availableCuisines: Array<{ id: string; name: string; slug: string; count: number }>
}

/**
 * The city's inventory, answered WITHOUT a delivery point.
 *
 * "What does DailyBread offer in Nairobi?" — a different question from "what
 * can reach this address", and one a customer is entitled to ask before giving
 * anyone an address. It carries no `serviceability`, because there is no point
 * to resolve: every outlet here is sellable and in a zone that may trade, and
 * whether it can reach a particular door is unknowable and therefore unsaid.
 */
export interface CityDiscoveryResult {
  city    : MarketCity
  outlets : DiscoveryOutlet[]
  total   : number
  page    : number
  pageSize: number
  availableCuisines: Array<{ id: string; name: string; slug: string; count: number }>
}

// ─── Storefront ──────────────────────────────────────────────────────────────

export interface StorefrontOption {
  id             : string
  name           : string
  priceDeltaMinor: number
  isAvailable    : boolean
}

export interface StorefrontModifierGroup {
  id         : string
  name       : string
  description: string | null
  minSelect  : number
  maxSelect  : number
  /** Derived from minSelect, never stored. */
  isRequired : boolean
  options    : StorefrontOption[]
}

/**
 * A dish photograph as a customer receives it: the processed public master at
 * a STABLE URL (immutable, long-cached — never a signed link), with what a
 * renderer needs to reserve its space and blur it in. The master keeps the
 * photo's own aspect ratio; each surface crops it with CSS.
 */
export interface MenuImage {
  url        : string
  width      : number
  height     : number
  /** ~20px WebP data URI for placeholder="blur". */
  blurDataUrl: string
}

export interface StorefrontMenuItem {
  /** The MenuItem — the dish. Kept as `id` for the storefront's existing
   *  consumers; the cart addresses a line by this plus the outlet. */
  id          : string
  /** The Meal — this dish AT this outlet, the customer's canonical identity
   *  for it (`GET /meals/:mealId`). */
  mealId      : string
  name        : string
  description : string | null
  portionSize : string | null
  /** The main image (the vendor's first), or null when the dish has none. */
  image       : MenuImage | null
  /** Every photo, main first. */
  images      : MenuImage[]
  prepTimeMinutes: number | null
  cuisines    : Array<{ id: string; name: string; slug: string }>
  dietaryTags : Array<{ id: string; name: string; slug: string }>
  /** What this dish costs AT THIS OUTLET, after any outlet override and any
   *  offer currently applying. */
  priceMinor  : number
  /** The pre-discount price, present only when an offer is actually applying —
   *  this is the struck-through figure. */
  wasPriceMinor: number | null
  offer       : DiscoveryOffer | null
  price       : PriceBreakdown
  isAvailable : boolean
  unavailableReason: MenuItemUnavailableReason | null
  modifierGroups: StorefrontModifierGroup[]
}

export interface StorefrontSection {
  id   : string
  name : string
  items: StorefrontMenuItem[]
}

export interface StorefrontHours {
  dayOfWeek: string
  openTime : string
  closeTime: string
  isClosed : boolean
}

export interface Storefront {
  outletId    : string
  vendorId    : string
  name        : string
  displayName : string
  tagline     : string | null
  description : string | null
  logoUrl     : string | null
  coverUrl    : string | null
  addressLine1: string
  neighborhood: string | null
  latitude    : number
  longitude   : number
  phone       : string | null
  rating      : number
  reviewCount : number
  cuisines    : Array<{ id: string; name: string; slug: string }>
  dietaryTags : Array<{ id: string; name: string; slug: string }>
  currency    : CustomerCurrency
  deliveryFeeMinor : number | null
  minimumOrderMinor: number | null
  isOpenNow   : boolean
  /** Whether the outlet can take an order at all right now — the customer-side
   *  reading of getOutletGoLiveStatus. */
  isAcceptingOrders: boolean
  hours       : StorefrontHours[]
  offers      : DiscoveryOffer[]
  /** Populated only when the request carried a location. */
  distanceMeters: number | null
  eta           : DeliveryEstimate | null
  /** The market this outlet trades in — an outlet id carries no city, so the
   *  client learns it here rather than inferring it from a link. */
  city          : MarketCity
  /** Null when the request carried no location. */
  delivery      : StorefrontDelivery | null
  sections      : StorefrontSection[]
}

/**
 * Whether this outlet delivers to the location the request carried. The
 * verdict is the SAME test the located feeds apply — the customer's own zone,
 * then this outlet's city, zone and radius — so a storefront can never claim
 * to deliver somewhere the feed would not list it.
 */
export interface StorefrontDelivery {
  /** The customer's point, resolved: which city and zone, and whether we
   *  serve it at all. */
  serviceability: Serviceability
  deliversHere  : boolean
}

// ─── Meals ───────────────────────────────────────────────────────────────────

/**
 * The outlet a meal is sold at, as a meal card or detail needs it. The logo is
 * a short-lived signed URL (vendor media lives in the private bucket).
 */
export interface MealOutletRef {
  outletId   : string
  name       : string
  displayName: string
  logoUrl    : string | null
}

/** Only on a LOCATED feed — measured from the customer's point, never
 *  invented for a city-wide list. */
export interface MealDelivery {
  distanceMeters  : number
  eta             : DeliveryEstimate
  deliveryFeeMinor: number | null
}

/**
 * One meal in a discovery feed — a dish AT an outlet (Meal = MenuItem at an
 * Outlet), never a dish in the abstract: price, offer, availability and reach
 * all differ by outlet.
 *
 * Lighter than StorefrontMenuItem on purpose: the main image only, and no tax
 * breakdown or modifiers — those belong to the detail read.
 *
 * Sold-out meals never appear in a feed. `isAvailable` is false only when the
 * outlet is closed right now (`OUTLET_CLOSED`), which a card shows as such.
 */
export interface DiscoveryMeal {
  mealId     : string
  menuItemId : string
  outletId   : string
  name       : string
  description: string | null
  image      : MenuImage | null
  cuisines   : Array<{ id: string; name: string; slug: string }>
  dietaryTags: Array<{ id: string; name: string; slug: string }>
  /** What it costs at this outlet right now — the outlet's price, less the
   *  single best offer applying there. */
  priceMinor   : number
  /** Present only while an offer is applying — the struck-through figure. */
  wasPriceMinor: number | null
  offer        : DiscoveryOffer | null
  currency     : CustomerCurrency
  outlet       : MealOutletRef
  isAvailable      : boolean
  unavailableReason: MenuItemUnavailableReason | null
  delivery         : MealDelivery | null
}

/** A cuisine facet on a MEAL list: `count` is meals, counted by the dish's
 *  own cuisines — the entity the filter matches. */
export interface MealCuisineFacet {
  id   : string
  name : string
  slug : string
  count: number
}

export interface MealDiscoveryFilters {
  search?       : string
  cuisineIds?   : string[]
  dietaryTagIds?: string[]
  hasOffer?     : boolean
  /** Located feed only — every ordering is distance- or ETA-derived. */
  sort?         : DiscoverySort
  page?         : number
  pageSize?     : number
}

/** Meals that can reach a customer's point. */
export interface MealDiscoveryResult {
  serviceability   : Serviceability
  meals            : DiscoveryMeal[]
  total            : number
  page             : number
  pageSize         : number
  availableCuisines: MealCuisineFacet[]
}

/** Meals sold anywhere in a city, answered with no point. */
export interface CityMealDiscoveryResult {
  city             : MarketCity
  meals            : DiscoveryMeal[]
  total            : number
  page             : number
  pageSize         : number
  availableCuisines: MealCuisineFacet[]
}

/**
 * One meal in full — `GET /meals/:mealId`. The storefront's own item
 * presentation (gallery, modifiers, tax breakdown, availability), with the
 * identities spelled out and the outlet and market it belongs to.
 */
export interface MealDetail extends Omit<StorefrontMenuItem, "id" | "mealId"> {
  mealId    : string
  menuItemId: string
  outletId  : string
  section   : { id: string; name: string } | null
  currency  : CustomerCurrency
  outlet    : MealOutletRef
  city      : MarketCity
}

// ─── Cart ────────────────────────────────────────────────────────────────────

export interface CartLineRequest {
  menuItemId: string
  quantity  : number
  /** Flat. The server resolves which group each option belongs to. */
  selectedOptionIds: string[]
}

export interface PriceCartRequest {
  outletId: string
  lines   : CartLineRequest[]
}

export interface CartProblem {
  code      : CartProblemCode
  message   : string
  /** Index of the offending line, when the problem belongs to one. */
  lineIndex?: number
  menuItemId?: string
  optionId? : string
  groupId?  : string
}

export interface PricedCartLine {
  lineIndex    : number
  menuItemId   : string
  name         : string
  imageUrl     : string | null
  quantity     : number
  options      : Array<{ id: string; name: string; priceDeltaMinor: number; groupId: string }>
  unitMinor    : number
  subtotalMinor: number
  discountMinor: number
  totalMinor   : number
  appliedOfferId  : string | null
  appliedOfferName: string | null
}

export interface PricedCart {
  outletId     : string
  currency     : CustomerCurrency
  lines        : PricedCartLine[]
  subtotalMinor: number
  discountMinor: number
  taxMinor     : number
  taxLabel     : string | null
  taxInclusive : boolean
  /** Null when the outlet has not set one. */
  deliveryFeeMinor : number | null
  minimumOrderMinor: number | null
  /** Food only — the figure a minimum-order rule and a merchant offer are both
   *  measured against. */
  foodTotalMinor   : number
  /** Food plus delivery. What the customer will actually be charged, before a
   *  payment method adds anything of its own. */
  orderTotalMinor  : number
  /** Every reason this cart cannot be ordered as it stands. Empty means it can. */
  problems     : CartProblem[]
  canCheckout  : boolean
}
