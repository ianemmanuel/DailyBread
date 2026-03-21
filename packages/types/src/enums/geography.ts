// ─── Geography enums ──────────────────────────────────────────────────────────
// Mirror of the Prisma GeoStatus enum.
// Import from here — never from @repo/db — so frontend apps don't
// take a dependency on the database package.

export enum GeoStatus {
  ACTIVE   = "ACTIVE",
  INACTIVE = "INACTIVE",
}