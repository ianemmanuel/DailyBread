import { VendorApplicationStatus } from "../../enums/vendor"
import { DocumentStatus } from "../../enums/document"

// ─── Vendor application API contracts ────────────────────────────────────────
// These match the existing vendor onboarding routes.
// Captured here so frontend apps import from @repo/types, not from each other.

// ─── GET /api/vendor/v1/application ──────────────────────────────────────────

export interface ApplicationResponse {
  id                : string
  status            : VendorApplicationStatus
  countryId         : string
  vendorTypeId      : string
  otherVendorType   : string | null
  legalBusinessName : string
  registrationNumber: string | null
  taxId             : string | null
  businessEmail     : string
  businessPhone     : string | null
  ownerFirstName    : string
  ownerLastName     : string
  ownerPhone        : string | null
  ownerEmail        : string | null
  businessAddress   : string
  addressLine2      : string | null
  postalCode        : string | null
  rejectionReason   : string | null
  revisionNotes     : string | null
  submittedAt       : string | null
  documents         : ApplicationDocumentSummary[]
}

export interface ApplicationDocumentSummary {
  id             : string
  documentTypeId : string
  documentName   : string | null
  status         : DocumentStatus
}

// ─── POST /api/vendor/v1/application/upsert-application ─────────────────────

export interface UpsertApplicationRequest {
  countryId         : string
  vendorTypeId      : string
  otherVendorType?  : string
  legalBusinessName : string
  registrationNumber?: string
  taxId?            : string
  businessEmail     : string
  businessPhone?    : string
  ownerFirstName    : string
  ownerLastName     : string
  ownerPhone?       : string
  ownerEmail?       : string
  businessAddress   : string
  addressLine2?     : string
  postalCode?       : string
}

// ─── GET /api/vendor/v1/documents/requirements/:applicationId ─────────────────

export interface DocumentRequirement {
  documentTypeId : string
  name           : string
  isRequired     : boolean
  uploaded       : boolean
  uploadedDocument: UploadedDocumentInfo | null
}

export interface UploadedDocumentInfo {
  id            : string
  documentName  : string | null
  documentTypeId: string
  storageKey    : string
  mimeType      : string | null
  status        : DocumentStatus
}

export interface DocumentRequirementsResponse {
  requirements : DocumentRequirement[]
  progress     : DocumentProgress
}

export interface DocumentProgress {
  requiredTotal    : number
  uploadedRequired : number
  uploadedTotal    : number
  isComplete       : boolean
  percentage       : number
}

// ─── POST /api/vendor/v1/documents/presign ───────────────────────────────────

export interface PresignUploadRequest {
  applicationId  : string
  documentTypeId : string
  fileName       : string
  fileType       : string
}

export interface PresignUploadResponse {
  uploadUrl  : string
  storageKey : string
}

// ─── POST /api/vendor/v1/documents/upsert ────────────────────────────────────

export interface UpsertDocumentRequest {
  applicationId  : string
  documentTypeId : string
  storageKey     : string
  documentName   : string
  fileSize       : number
  mimeType       : string
}

export interface UpsertDocumentResponse {
  document : UploadedDocumentInfo
  progress : DocumentProgress
}