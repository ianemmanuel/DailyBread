//* Frontend-safe vendor types — the entry point apps/vendor-dashboard
//* should import from (`@repo/types/vendor-app`).
//*
//* Application/session/document shapes below are thin re-exports of
//* packages/types/src/domain/vendor.ts, the actual source of truth —
//* never hand-duplicated here, so they can't drift out of sync with the
//* backend again. Only Country/VendorType are hand-declared, because
//* they represent a genuinely different (slimmer) shape than
//* domain/country.ts's Country entity: the exact response of
//* GET /meta/v1/onboarding/{countries,vendor-types}, not the full
//* admin-facing Country/VendorType row.
//*
//* Deliberately excludes:
//*   - anything Express-dependent (only in ../backend/vendor.ts, which
//*     frontend apps must never import — it depends on the express
//*     Request type)
//*   - assignedReviewerId / reviewedById — internal reviewer-ownership
//*     ids the vendor-facing backend endpoints never return (reviewer
//*     ownership is an admin-side accountability mechanism only)

export { VendorApplicationStatus } from "../enums/vendor"

export type {
  VendorLifecycleState,
  VendorSessionData,
  VendorSessionApplication,
  VendorSessionAccount,
  VendorDocument,
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
  OutletInspectionStatus,
  OutletInspectionRow,
  OutletInspectionPolicy,
  OutletMealPlanBlocker,
  OutletMealPlanReadiness,
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
  CreateVendorApplicationRequest,
  UpdateVendorApplicationRequest,
  ChangeVendorApplicationScopeRequest,
} from "../domain/vendor"

//* Operational-geography shapes the outlet location picker consumes.
//* Sourced from domain/geography.ts, the shared source of truth — the
//* vendor-facing subset only (no ZoneLevel, no admin metadata).
export type {
  GeoPoint,
  GeoJsonPolygon,
  GeoJsonMultiPolygon,
  ZoneBoundary,
  OutletPlacement,
  OutletPlacementStatus,
  OutletPlacementCapabilities,
  CityCoverage,
  CityCoverageZone,
} from "../domain/geography"


import type { VendorApplicationWithDetails } from "../domain/vendor"

/*
 * GET /vendor/v1/application/get and GET /vendor/v1/application/preview
 * response shape. Matches VendorApplicationWithDetails exactly minus
 * assignedReviewerId/reviewedById, which the backend strips before
 * returning an application to the vendor that owns it — see
 * vendor.application.service.ts's getApplication/previewApplication.
 *
 * Not the same as VendorSessionApplication, which is the slim shape
 * loaded on every request by loadVendorContext and returned by
 * GET /vendor/v1/auth/session.
 */
export type VendorApplicationDetail = Omit<VendorApplicationWithDetails, "assignedReviewerId" | "reviewedById">

//* Represents a country for onboarding dropdowns — the exact shape of
//* GET /meta/v1/onboarding/countries. Not domain/country.ts's Country,
//* which carries cities/region/audit fields that endpoint never selects.
export interface Country {
  id: string
  name: string
  code: string
  currency: string
  phoneCode: string
  currencySymbol?: string | null
}

//* Represents a vendor type for onboarding dropdowns — the exact shape
//* of GET /meta/v1/onboarding/vendor-types.
export interface VendorType {
  id: string
  name: string
  description?: string | null
}
