//* src/backend/customer.ts
//! NEVER import this file in frontend apps — it depends on Express types.

import type { Request } from "express"
import type { CustomerAccount } from "../domain/customer"

export type {
  CustomerAccount,
  CustomerSessionData,
  CustomerAddress,
  UpsertCustomerAddressRequest,
  Serviceability,
  CheckServiceabilityRequest,
  CustomerCurrency,
  PriceBreakdown,
  DeliveryEstimate,
  DiscoveryOutlet,
  DiscoveryOffer,
  DiscoveryFilters,
  DiscoveryResult,
  StorefrontOption,
  StorefrontModifierGroup,
  StorefrontMenuItem,
  StorefrontSection,
  StorefrontHours,
  Storefront,
  CartLineRequest,
  PriceCartRequest,
  CartProblem,
  PricedCartLine,
  PricedCart,
} from "../domain/customer"

export {
  ConsumerStatus,
  ServiceabilityStatus,
  DiscoverySort,
  MenuItemUnavailableReason,
  CartProblemCode,
} from "../enums/customer"

/** After verifyCustomerToken — identity only, no database read yet. */
export interface AuthenticatedCustomerRequest extends Request {
  customerClerkUserId: string
}

/**
 * After loadCustomerContext. `customer` is guaranteed present, which is what
 * separates this from MaybeCustomerRequest below.
 */
export interface CustomerRequest extends Request {
  customer: CustomerAccount
}

/**
 * After attachCustomerContext — the OPTIONAL chain.
 *
 * Most of the customer surface is public: browsing restaurants, opening a
 * storefront and pricing a basket all work signed-out, exactly as they do on
 * Uber Eats and DoorDash, and requiring an account to look at a menu is the
 * fastest way to lose someone who has not decided to order yet. Only the
 * account's own data (addresses, profile, and later orders) requires identity.
 */
export interface MaybeCustomerRequest extends Request {
  customer?: CustomerAccount | null
}
