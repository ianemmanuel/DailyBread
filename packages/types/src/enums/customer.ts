/*
 * Customer-domain enums.
 *
 * Hand-declared rather than re-exported from Prisma, the same convention the
 * other enum files here follow: frontend apps must never pull @repo/db in, and
 * TS enums are not structurally compatible across declarations, so the cast
 * happens once at the Prisma boundary in the backend.
 */

export const ConsumerStatus = {
  ACTIVE   : "ACTIVE",
  SUSPENDED: "SUSPENDED",
  DELETED  : "DELETED",
} as const
export type ConsumerStatus = (typeof ConsumerStatus)[keyof typeof ConsumerStatus]

/**
 * Why a customer's address can or cannot be served. Mirrors
 * customer.serviceability.ts exactly — the backend returns the code and the
 * customer app owns the wording, the same split VendorGoLiveBlocker makes.
 */
export const ServiceabilityStatus = {
  SERVICEABLE        : "SERVICEABLE",
  OUTSIDE_COVERAGE   : "OUTSIDE_COVERAGE",
  AREA_NOT_LAUNCHED  : "AREA_NOT_LAUNCHED",
  AREA_PAUSED        : "AREA_PAUSED",
  CITY_INACTIVE      : "CITY_INACTIVE",
  AREA_NOT_CONFIGURED: "AREA_NOT_CONFIGURED",
} as const
export type ServiceabilityStatus = (typeof ServiceabilityStatus)[keyof typeof ServiceabilityStatus]

/** How the discovery feed is ordered. RELEVANCE is the default, as on every
 *  marketplace — see the weighting note in customer.discovery.ts. */
export const DiscoverySort = {
  RELEVANCE    : "RELEVANCE",
  DISTANCE     : "DISTANCE",
  RATING       : "RATING",
  DELIVERY_TIME: "DELIVERY_TIME",
} as const
export type DiscoverySort = (typeof DiscoverySort)[keyof typeof DiscoverySort]

/**
 * Why a dish cannot currently be ordered. A customer is shown the dish anyway
 * (greyed out, exactly as Uber Eats and DoorDash do) — hiding it would make a
 * regular think the restaurant stopped selling their usual.
 */
export const MenuItemUnavailableReason = {
  /** 86'd at this outlet today. */
  OUT_OF_STOCK   : "OUT_OF_STOCK",
  /** The outlet is shut right now. */
  OUTLET_CLOSED  : "OUTLET_CLOSED",
} as const
export type MenuItemUnavailableReason =
  (typeof MenuItemUnavailableReason)[keyof typeof MenuItemUnavailableReason]

/** Why a cart cannot be checked out as it stands. Every one is recoverable by
 *  the customer, which is why they are returned as a list rather than as a
 *  single error — telling someone about one problem at a time is how a basket
 *  gets abandoned. */
export const CartProblemCode = {
  OUTLET_UNAVAILABLE   : "OUTLET_UNAVAILABLE",
  OUTLET_CLOSED        : "OUTLET_CLOSED",
  ITEM_UNAVAILABLE     : "ITEM_UNAVAILABLE",
  OPTION_UNAVAILABLE   : "OPTION_UNAVAILABLE",
  OPTION_NOT_ON_ITEM   : "OPTION_NOT_ON_ITEM",
  REQUIRED_CHOICE_MISSING: "REQUIRED_CHOICE_MISSING",
  TOO_MANY_CHOICES     : "TOO_MANY_CHOICES",
  BELOW_MINIMUM_ORDER  : "BELOW_MINIMUM_ORDER",
  EMPTY_CART           : "EMPTY_CART",
} as const
export type CartProblemCode = (typeof CartProblemCode)[keyof typeof CartProblemCode]
