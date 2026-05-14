//* src/frontend/admin.ts


//* ─── Admin dashboard type exports ────────────────────────────────────────────
// This is the ONLY file Next.js dashboard components should import from.
//? Usage: import type { AdminSessionData } from "@repo/types/admin-dashboard"
//! Never import from @repo/types/backend — that file depends on Express.

//* API
export type { AdminSessionData } from "../api/admin/auth"
export type { SessionRole } from "../api/admin/auth"
export type { SessionScope } from "../api/admin/auth"
export type { SessionScopeContext } from "../api/admin/auth"

//* ENUMS
export type { AdminPermissionKey } from "../enums/admin"
export { AdminPermissions } from "../enums/admin"
export type { AdminRoleName } from "../enums/admin"
export { AdminRoleNames } from "../enums/admin"
export { AdminUserStatus } from "../enums/admin"
export { AdminScopeType } from "../enums/admin"

export type { ServiceAreaMode } from "../enums/geography"
export type { GeoStatus } from "../enums/geography"
export type { OutletServiceMode } from "../enums/geography"
export type { BoundarySource } from "../enums/geography"   

//* DOMAIN TYPES

//* Geography
export type { Country } from "../domain/geography"
export type { City } from "../domain/geography"
export type { CityDetail } from "../domain/geography"
export type { OsmPreviewResult } from "../domain/geography"
export type { CityBoundaryData } from "../domain/geography"
export type { ServiceArea } from "../domain/geography"
export type { DeliveryZone } from "../domain/geography"
export type { CityBoundary } from "../domain/geography"
export type { ServiceAreaBoundary } from "../domain/geography"
export type { DeliveryZoneBoundary } from "../domain/geography" 
export type { BoundingBox } from "../domain/geography"
export type { GeoPoint } from "../domain/geography"

export type { ApiSuccess, ApiErrorResponse } from "../api/common"