//* src/backend/vendor.ts
//! NEVER import this file in frontend apps — it depends on Express types.


export type {
  VendorType,
  VendorTypeCountry,
  VendorApplication,
  VendorApplicationWithDetails,
  VendorAccount,
  VendorAccountWithDetails,
  VendorProfile,
  VendorDocument,
  OutletSummary,
  ApplicationResponse,
  ApplicationDocumentSummary,
  UpsertApplicationRequest,
  DocumentRequirement,
  UploadedDocumentInfo,
  DocumentRequirementsResponse,
  DocumentProgress,
  PresignUploadRequest,
  PresignUploadResponse,
  UpsertDocumentRequest,
  UpsertDocumentResponse,
  CreateOutletInput,
  UpdateOutletInput,
  OperatingHoursEntry,
  AddPayoutAccountInput,
  idParam,
} from "../domain/vendor"