//* src/backend/admin.ts
//! NEVER import this file in frontend apps — it depends on Express types.

import type { Request } from "express"
import type { AdminUserWithRole, AdminScopeContext } from "../domain/admin"
import type { AdminPermissionKey } from "../enums/admin"
export type { AdminPermissionKey } from "../enums/admin"

export type {
  AdminPermission,
  AdminRole,
  AdminRoleWithPermissions,
  AdminUserScope,
  AdminUser,
  AdminUserPermissionGrant,
  AdminUserWithRole,
  AdminUserProfile,
  AdminScopeContext,
  AuditLog,
  AuditLogWithAdmin,
  ListAdminUsersParams,
  CreateAdminUserRequest,
  UpdateAdminUserPermissionsRequest,
  SuspendAdminUserRequest,
  DeactivateAdminUserRequest,
  UpdateAdminUserRoleRequest,
  ScopeEntry,
  UpdateAdminUserScopesRequest,
  AdminUserListItem,
  AdminUserDetail,
  SessionRole,
  SessionScope,
  SessionScopeContext,
  AdminSessionData,
  ListApplicationsParams,
  ApplicationQueueItem,
  ApplicationDetail,
  ApproveApplicationResponse,
  RejectApplicationRequest,
  ListVendorAccountsParams,
  VendorAccountListItem,
  VendorAccountDetail,
  SuspendVendorRequest,
} from "../domain/admin";


export type {
  CreateOutletRequest,
  UpdateOutletRequest,
  AddPayoutAccountRequest,
  OperatingHoursEntry,
  idParam,
  
} from "../domain/vendor" 


export type { 
  CountryKPIs, 
  KPITrend, 
  CityKPIs, 
  OutletKPIs, 
  VendorKPIs, 
  KPIResult,
  CustomerKPIs
} from "../domain/kpi"

export type { 
  CityBoundary, 
  CreateCityRequest, 
  UpdateCityRequest,
  City,
  CityBoundaryData,
  CityDetail,
  OsmPreviewResult,
  CityWithCountry,
  SaveCityBoundaryRequest,
  ListCitiesParams
} from "../domain/city"

export type { 
  ServiceAreaBoundary, 
  DeliveryZoneBoundary, 
  BoundingBox,
  GeoJsonPolygon,
  GeoJsonMultiPolygon,
  GeoPoint,
  ServiceArea,
  ListServiceAreasParams,
  ServiceAreaListItem,
  CreateServiceAreaRequest,
  UpdateServiceAreaRequest,
  UpdateDeliveryZoneRequest,
  DeliveryZone,
  CreateDeliveryZoneRequest,
} from "../domain/geography"

export type {
  Country,
  UpdateCountryRequest,
  CountrySummaryResult,
  CreateCountryRequest,
  CountryWithCities,
  CountryVendorSnapshot,
} from "../domain/country"

export type {
  RegionBreakdown,
  RegionBreakdownItem,
  RegionSummaryResult,
  RegionWithCountries,
  CreateRegionRequest,
 UpdateRegionRequest,
} from "../domain/region"

export type { ServiceAreaMode } from "../enums/geography"


export interface AuthenticatedAdminRequest extends Request {
  adminClerkUserId: string
}

// After the full chain runs — what controllers receive
export interface AdminRequest extends AuthenticatedAdminRequest {
  adminUser        : AdminUserWithRole
  adminPermissions : AdminPermissionKey[]
  adminScope       : AdminScopeContext
}


export type AuthOk<T extends object>  = { ok: true } & T
export type AuthFail = { ok: false; status: number; message: string }
export type AuthResult<T extends object> = AuthOk<T> | AuthFail