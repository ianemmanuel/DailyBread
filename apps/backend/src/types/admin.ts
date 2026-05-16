//* IMPORTS

import type {
  CityBoundary,
  ServiceAreaBoundary,
  DeliveryZoneBoundary,
  ServiceAreaMode,
} from "@repo/geo/types"


//* USERS

export interface ScopeEntry {
  scopeType : "GLOBAL" | "COUNTRY" | "CITY"
  countryId?: string
  cityId?   : string
}

export interface CreateAdminUserInput {
  firstName      : string
  middleName?    : string
  lastName       : string
  email          : string
  employeeId?    : string
  roleId         : string
  permissionKeys : string[]
  scopes?        : ScopeEntry[]
}

export interface UpdateAdminUserPermissionsInput {
  adminUserId    : string
  permissionKeys : string[]
}

export interface UpdateAdminUserRoleInput {
  adminUserId : string
  roleId      : string
}

export interface UpdateAdminUserScopesInput {
  adminUserId : string
  scopes      : ScopeEntry[]
}


//* GEOGRAPHY


export interface BoundingBoxInput {
  north: number
  south: number
  east : number
  west : number
}


export interface CreateCityInput {
  countryId : string
  name      : string
  code?     : string
  timezone  : string
  latitude? : number
  longitude?: number
}

export interface UpdateCityInput {
  name?     : string
  code?     : string
  timezone? : string
  latitude? : number
  longitude?: number
}

// The boundary GeoJSON sent here is whatever the admin confirmed on the map —
// either the original OSM polygon, an edited version, or a fully manual draw.
export interface SaveCityBoundaryInput {
  boundary  : CityBoundary
  osmId?    : string    // include if this originated from an OSM search
  source    : "OSM" | "MANUAL"
}

export interface CreateServiceAreaInput {
  name    : string
  mode    : ServiceAreaMode
  boundary: ServiceAreaBoundary
}

export interface UpdateServiceAreaInput {
  name?    : string
  mode?    : ServiceAreaMode
  boundary?: ServiceAreaBoundary
}

export interface CreateDeliveryZoneInput {
  name           : string
  boundary       : DeliveryZoneBoundary
  maxCourierCount?: number
}

export interface UpdateDeliveryZoneInput {
  name?          : string
  boundary?      : DeliveryZoneBoundary
  maxCourierCount?: number
}