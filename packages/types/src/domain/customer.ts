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
  /** The address discovery will anchor on unless the client says otherwise. */
  defaultAddressId: string | null
}

// ─── Addresses ───────────────────────────────────────────────────────────────

export interface CustomerAddress {
  id          : string
  label       : string | null
  addressLine1: string
  addressLine2: string | null
  city        : string
  postalCode  : string | null
  countryId   : string
  latitude    : number | null
  longitude   : number | null
  isDefault   : boolean
  createdAt   : string
  /** Resolved when the address was saved: which of the platform's cities this
   *  point falls in, and whether we serve it. Null latitude/longitude means it
   *  was never pinned, so nothing could be resolved. */
  serviceability: Serviceability | null
}

export interface UpsertCustomerAddressRequest {
  label?       : string | null
  addressLine1 : string
  addressLine2?: string | null
  city         : string
  postalCode?  : string | null
  countryId    : string
  latitude?    : number | null
  longitude?   : number | null
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
}

export interface CheckServiceabilityRequest {
  latitude : number
  longitude: number
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
  distanceMeters: number
  eta         : DeliveryEstimate
  isOpenNow   : boolean
  /** Null means the outlet has not set one, which is not the same as free. */
  deliveryFeeMinor : number | null
  minimumOrderMinor: number | null
  currency    : CustomerCurrency
  /** The best offer running on this outlet right now, for the feed badge.
   *  Null when nothing applies this minute. */
  offer       : DiscoveryOffer | null
  /** True when the platform carries the food; false when the vendor does. */
  platformDelivers: boolean
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

export interface StorefrontMenuItem {
  id          : string
  name        : string
  description : string | null
  portionSize : string | null
  imageUrl    : string | null
  imageUrls   : string[]
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
  sections      : StorefrontSection[]
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
