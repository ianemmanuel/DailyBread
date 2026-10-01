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
  CustomerMarket,
  CustomerMarketsResult,
  SelectCustomerMarketRequest,
  CustomerAddress,
  UpsertCustomerAddressRequest,

  // Coverage
  Serviceability,
  CheckServiceabilityRequest,

  // Markets — where we operate, for the city picker and the city pages
  Market,
  MarketCity,
  MarketsResult,
  CityMarket,
  /** Map viewport for a city page — presentation only, never a location. */
  CityViewport,
  CustomerCuisine,
  CustomerCuisinesResult,
  CustomerCuisineDetail,

  // Money
  CustomerCurrency,
  PriceBreakdown,

  // Discovery
  DeliveryEstimate,
  DiscoveryOutlet,
  DiscoveryOffer,
  DiscoveryFilters,
  DiscoveryResult,
  CityDiscoveryResult,

  // Storefront
  Storefront,
  StorefrontSection,
  StorefrontMenuItem,
  MenuImage,
  StorefrontModifierGroup,
  StorefrontOption,
  StorefrontHours,
  StorefrontDelivery,

  // Meals
  MealOutletRef,
  MealDelivery,
  DiscoveryMeal,
  MealCuisineFacet,
  MealDiscoveryFilters,
  MealDiscoveryResult,
  CityMealDiscoveryResult,
  MealDetail,

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
