// ─── Geography enums ──────────────────────────────────────────────────────────
/* 
  Mirror of the Prisma GeoStatus enum.
  Import from here — never from @repo/db — so frontend apps don't take a dependency on the database package.
*/

export type ServiceAreaMode =
  | "FULL_SERVICE"
  | "SELF_DELIVERY"
  | "WAITLIST"
  | "EXCLUDED"

export type GeoStatus = "ACTIVE" | "INACTIVE"

export type OutletServiceMode = "FULL_SERVICE" | "SELF_DELIVERY" | "WAITLIST"

export type BoundarySource = "OSM" | "MANUAL"