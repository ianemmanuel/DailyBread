import { AdminPermissionKey } from "../../enums/admin"
import type { AdminUserScope } from "../../domain/admin"

// Re-export so consumers can import AdminScopeContext from either place
export type { AdminScopeContext } from "../../domain/admin"

// ─── GET /api/admin/v1/auth/session ──────────────────────────────────────────
//
// These are WIRE types — what actually travels over HTTP as JSON.
// Dates become strings via JSON.stringify. Domain types use Date;
// API types use string for any DateTime field that crosses the wire.

export interface SessionRole {
  name       : string
  displayName: string
}

// Scope rows as they arrive at the frontend — scopeType is a plain string
// since JSON doesn't carry enum metadata.
export interface SessionScope {
  id          : string
  adminUserId : string
  scopeType   : "GLOBAL" | "COUNTRY" | "CITY"
  countryId   : string | null
  cityId      : string | null
}

export interface SessionScopeContext {
  isGlobal   : boolean
  countryIds : string[]
  cityIds    : string[]
  scopes?    : SessionScope[]
}

export interface AdminSessionData {
  id          : string
  email       : string
  fullName    : string
  role        : SessionRole
  permissions : AdminPermissionKey[]
  scope       : SessionScopeContext
}