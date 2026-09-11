
//* Mirror of the Prisma GeoStatus enum-Import from here — never from @repo/db — so frontend apps don't take a dependency on the database package.

export type ServiceAreaMode =
  | "FULL_SERVICE"
  | "SELF_DELIVERY"
  | "WAITLIST"
  | "EXCLUDED"

export type GeoStatus = "ACTIVE" | "INACTIVE"

export type BoundarySource = "OSM" | "MANUAL"

//* Mirror of the Prisma ZoneLevel enum. Ordered least → most capable; the
//* level → capability-flags mapping lives in @repo/geo (ZONE_CAPABILITIES).
export type ZoneLevel =
  | "REGISTRATION_ONLY"
  | "MARKETPLACE"
  | "PLATFORM_DELIVERY"
  | "FULL_OPERATIONS"

//* Mirror of the Prisma ZoneOperationalStatus enum. Orthogonal to ZoneLevel.
export type ZoneOperationalStatus =
  | "ACTIVE"
  | "SUSPENDED"
  | "MAINTENANCE"
  | "EMERGENCY"

//* Mirrors of the Prisma MarketSignal* enums.
export type MarketSignalType = "VENDOR_INTEREST" | "CUSTOMER_INTEREST"
export type MarketSignalStatus = "OPEN" | "ACTIONED" | "DISMISSED"