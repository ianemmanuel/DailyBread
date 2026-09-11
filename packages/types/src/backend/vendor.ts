//* src/backend/vendor.ts
//! NEVER import this file in frontend apps — it depends on Express types.

import type { Request } from "express"
import type { 
  VendorSessionApplication, 
  VendorSessionAccount, 
  VendorLifecycleState 
} from "../domain/vendor"

export type {
  VendorType,
  VendorTypeCountry,
  CreateVendorTypeRequest,
  UpdateVendorTypeRequest,
  AssignVendorTypeToCountryRequest,
  DocumentTypeConfig,
  DocumentTypeVendorType,
  CreateDocumentTypeRequest,
  UpdateDocumentTypeRequest,
  AssignDocumentTypeToVendorTypeRequest,
  VendorUser,
  VendorApplication,
  VendorApplicationWithDetails,
  VendorAccount,
  VendorAccountWithDetails,
  VendorProfile,
  ProfileReviewStatus,
  UpsertVendorProfileRequest,
  VendorFoodTag,
  VendorFoodTagOptions,
  ProfileMediaKind,
  ProfileMediaPresignRequest,
  ProfileMediaPresignResponse,
  VendorGoLiveStatus,
  VendorGoLiveBlocker,
  OutletGoLiveStatus,
  OutletClearanceStatus,
  OutletGoLiveBlocker,
  OutletInspectionPolicy,
  OutletInspectionStatus,
  OutletInspectionRow,
  AdminOutletInspectionRow,
  OutletInspectionListResult,
  OutletInspectionDetail,
  OutletMealPlanBlocker,
  OutletMealPlanReadiness,
  VendorProfileWithVendor,
  VendorDocument,
  OutletSummary,
  VendorLifecycleState,
  VendorSessionApplication,
  VendorSessionAccount,
  VendorSessionData,
  ApplicationResponse,
  ApplicationDocumentSummary,
  CreateVendorApplicationRequest,
  UpdateVendorApplicationRequest,
  ChangeVendorApplicationScopeRequest,
  DocumentRequirement,
  UploadedDocumentInfo,
  DocumentRequirementsResponse,
  DocumentProgress,
  PresignUploadRequest,
  PresignUploadResponse,
  UpsertDocumentRequest,
  UpsertDocumentResponse,
  VendorDocumentActionStatus,
  VendorAccountDocumentStatusRow,
  UpsertAccountDocumentRequest,
  UpsertAccountDocumentResponse,
  OutletDocumentSeverity,
  OutletDocumentStatusRow,
  UpsertOutletDocumentRequest,
  UpsertOutletDocumentResponse,
  AdminOutletDocumentRow,
  CreateOutletRequest,
  UpdateOutletRequest,
  OperatingHoursEntry,
  AddPayoutAccountRequest,
  PayoutVerificationRequirement,
  PayoutProofDocumentType,
  AvailablePayoutMethod,
  VendorPayoutAccount,
  VendorPayoutBankOption,
  VendorSupportedBanks,
  PayoutVerificationStatus,
  PayoutMaskedDetails,
  PayoutRiskFlag,
  idParam,
} from "../domain/vendor"

//* Vendor-facing operational geography — the outlet location picker's shapes.
export type {
  OutletPlacement,
  OutletPlacementStatus,
  OutletPlacementCapabilities,
  CityCoverage,
  CityCoverageZone,
} from "../domain/geography"


//* STEP 1 output — set by verifyVendorToken, before VendorUser is loaded.
export interface AuthenticatedVendorRequest extends Request {
  vendorClerkUserId: string
}

/*
  * Request-context shape populated by loadVendorContext. Same field
  * shapes as VendorSessionData's application/vendorAccount (the slim,
  * loadVendorContext-loaded versions) — not the richer *WithDetails
  * types, which only the dedicated GET /application and GET
  * /vendor-account endpoints fetch.
*/
export interface VendorContext {
  user: {
    id       : string
    email    : string
    isActive : boolean
    isBanned : boolean
    banReason: string | null
    bannedAt : string | null
  }
  application: VendorSessionApplication | null
  account    : VendorSessionAccount | null
  state      : VendorLifecycleState
}

//* After the full chain runs — what controllers receive.
export interface VendorRequest extends AuthenticatedVendorRequest {
  vendor: VendorContext
}