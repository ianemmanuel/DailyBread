//* Frontend-safe customer types — the entry point apps/customer-app
//* should import from (`@repo/types/customer-app`).
//*
//* Thin re-exports of domain/customer.ts and enums/customer.ts, which are the
//* actual source of truth, so these cannot drift from what the backend returns.
//*
//* Deliberately excludes ../backend/customer.ts, which frontend apps must
//* NEVER import — it declares the Express request shapes and so depends on the
//* express types.

export type {
  // Identity
  CustomerAccount,
  CustomerSessionData,
  CustomerAddress,
  UpsertCustomerAddressRequest,

  // Coverage
  Serviceability,
  CheckServiceabilityRequest,

  // Money
  CustomerCurrency,
  PriceBreakdown,

  // Discovery
  DeliveryEstimate,
  DiscoveryOutlet,
  DiscoveryOffer,
  DiscoveryFilters,
  DiscoveryResult,

  // Storefront
  Storefront,
  StorefrontSection,
  StorefrontMenuItem,
  StorefrontModifierGroup,
  StorefrontOption,
  StorefrontHours,

  // Cart
  CartLineRequest,
  PriceCartRequest,
  PricedCart,
  PricedCartLine,
  CartProblem,
} from "../domain/customer"

export {
  ConsumerStatus,
  ServiceabilityStatus,
  DiscoverySort,
  MenuItemUnavailableReason,
  CartProblemCode,
} from "../enums/customer"
