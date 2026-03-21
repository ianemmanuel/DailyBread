import {
  VendorApplication,
  VendorApplicationWithDetails,
  VendorAccount,
  VendorAccountWithDetails,
  VendorDocument,
} from "../../domain/vendor"
import { VendorApplicationStatus, VendorStatus } from "../../enums/vendor"
import { PaginationParams, DateRangeParams } from "../common"

// ─── GET /api/admin/v1/vendors/applications ───────────────────────────────────

export interface ListApplicationsParams extends PaginationParams, DateRangeParams {
  status?      : VendorApplicationStatus | VendorApplicationStatus[]
  countryId?   : string
  vendorTypeId?: string
  search?      : string   // searches legalBusinessName, businessEmail, ownerName
}

// What appears in the application queue table
export interface ApplicationQueueItem {
  id                : string
  legalBusinessName : string
  businessEmail     : string
  ownerFirstName    : string
  ownerLastName     : string
  status            : VendorApplicationStatus
  submittedAt       : string | null
  revisionCount     : number
  countryId         : string
  countryName       : string
  vendorTypeName    : string
  documentProgress  : {
    total    : number
    uploaded : number
    approved : number
  }
}

// ─── GET /api/admin/v1/vendors/applications/:id ───────────────────────────────

export type ApplicationDetail = VendorApplicationWithDetails & {
  countryName    : string
  vendorTypeName : string
}

// ─── PATCH /api/admin/v1/vendors/applications/:id/approve ────────────────────

// No request body — approval creates the VendorAccount automatically.
// The response includes the newly created account.
export interface ApproveApplicationResponse {
  application  : VendorApplication
  vendorAccount: VendorAccount
}

// ─── PATCH /api/admin/v1/vendors/applications/:id/reject ─────────────────────

export interface RejectApplicationRequest {
  rejectionReason : string   // shown to vendor in their dashboard
  revisionNotes?  : string   // additional detail on what to fix
  reasonCode?     : string   // AdminActionReason.code for audit log
}

// ─── GET /api/admin/v1/vendors/accounts ──────────────────────────────────────

export interface ListVendorAccountsParams extends PaginationParams, DateRangeParams {
  status?      : VendorStatus
  countryId?   : string
  vendorTypeId?: string
  search?      : string
}

export interface VendorAccountListItem {
  id                : string
  legalBusinessName : string
  businessEmail     : string
  status            : VendorStatus
  countryId         : string
  countryName       : string
  vendorTypeName    : string
  outletCount       : number
  createdAt         : string
  suspendedAt       : string | null
}

// ─── GET /api/admin/v1/vendors/accounts/:id ──────────────────────────────────

export type VendorAccountDetail = VendorAccountWithDetails & {
  countryName    : string
  vendorTypeName : string
  application    : VendorApplication
  documents      : VendorDocument[]
}

// ─── PATCH /api/admin/v1/vendors/accounts/:id/suspend ────────────────────────

export interface SuspendVendorRequest {
  reason         : string
  reasonCode?    : string   // AdminActionReason.code
  suspensionUntil?: string  // ISO date — null = indefinite
}

// ─── PATCH /api/admin/v1/vendors/accounts/:id/unsuspend ──────────────────────
// No request body needed.