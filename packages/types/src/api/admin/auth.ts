// src/api/admin/auth.ts
//
// Wire types for GET /api/admin/v1/auth/session.
// These are what actually travels over HTTP as JSON.


import type { AdminPermissionKey } from "../../enums/admin"


export interface SessionRole {
  name       : string
  displayName: string
}

// Scope rows as they arrive at the frontend.
// scopeType is a plain string union — JSON doesn't carry enum metadata.
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
  scopes?    : SessionScope[]  // raw rows for UI scope picker / display
}

// ─── Full session shape ───────────────────────────────────────────────────────
//
// role is nullable — roleId can be null during role-change transitions.
// The controller falls back to empty strings but the type should reflect reality.

export interface AdminSessionData {
  id          : string
  email       : string
  firstName   : string
  lastName    : string
  middleName? : string
  role        : SessionRole | null
  permissions : AdminPermissionKey[]
  scope       : SessionScopeContext
}