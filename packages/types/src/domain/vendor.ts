import { VendorStatus, VendorApplicationStatus, VendorTypeStatus } from "../enums/vendor"
import { GeoStatus } from "../enums/geography"

import { DocumentStatus } from "../enums/document"


export interface VendorType {
  id : string
  name : string
  description : string | null
  status : VendorTypeStatus
  createdByAdminId : string | null
  deletedAt : string | null
  createdAt : string
  updatedAt : string
}

export interface VendorTypeCountry {
  id : string
  countryId : string
  vendorTypeId : string
  status : GeoStatus
  createdByAdminId : string | null
  createdAt : string
  updatedAt : string
}

export interface VendorApplication {
  id : string
  userId : string | null
  countryId : string
  vendorTypeId : string
  otherVendorType : string | null
  legalBusinessName : string
  registrationNumber: string | null
  taxId : string | null
  businessEmail : string
  businessPhone : string | null
  ownerFirstName : string
  ownerLastName : string
  ownerPhone : string | null
  ownerEmail : string | null
  businessAddress : string
  addressLine2 : string | null
  postalCode : string | null
  status : VendorApplicationStatus
  revisionCount : number
  rejectionReason : string | null
  revisionNotes : string | null
  submittedAt : string | null
  reviewedAt : string | null
  approvedAt : string | null
  createdAt : string
  updatedAt : string
}

export interface VendorApplicationWithDetails extends VendorApplication {
  vendorType : VendorType
  documents  : VendorDocument[]
}

export interface VendorAccount {
  id : string
  userId : string | null
  vendorTypeId : string
  otherVendorType : string | null
  countryId : string
  applicationId : string
  status : VendorStatus
  legalBusinessName : string
  businessEmail : string
  businessPhone : string
  companyRegNumber : string | null
  taxRegistrationNumber : string | null
  taxIdType : string | null
  ownerFirstName : string
  ownerLastName : string
  ownerPhone : string | null
  ownerEmail : string | null
  businessAddress : string
  addressLine2 : string | null
  postalCode : string | null
  addressVerified : boolean
  suspensionReason : string | null
  suspendedAt : string | null
  suspensionUntil : string | null
  deactivatedAt : string | null
  deletedAt : string | null
  createdAt : string
  updatedAt : string
}

export interface VendorAccountWithDetails extends VendorAccount {
  vendorType : VendorType
  vendorProfile : VendorProfile | null
  outlets  : OutletSummary[]
}

// ─── Vendor profile ───────────────────────────────────────────────────────────

export interface VendorProfile {
  id : string
  vendorAccountId : string
  displayName : string
  tagline : string | null
  description : string | null
  logoUrl : string | null
  coverImageUrl : string | null
  publicEmail : string | null
  publicPhone : string | null
  website : string | null
  isVerifiedBadge : boolean
  isTopRated : boolean
  isCommunityFavorite : boolean
  isPublished : boolean
  isFeatured : boolean
  totalReviews : number
  averageRating : number
  publishedAt : string | null
  createdAt : string
  updatedAt : string
}


export interface VendorDocument {
  id : string
  applicationId : string | null
  vendorId : string | null
  documentTypeId  : string
  documentNumber  : string | null
  storageKey : string
  documentName : string | null
  fileSize : number | null
  mimeType : string | null
  issueDate : string | null
  expiryDate : string | null
  status : DocumentStatus
  uploadedAt : string
  reviewedAt : string | null
  approvedAt : string | null
  rejectedAt : string | null
  rejectionReason : string | null
  revisionNotes : string | null
  supersededBy : string | null
  supersededAt : string | null
  version : number
  createdAt : string
  updatedAt : string
}

// Minimal outlet shape used as a relation on VendorAccount
// Full Outlet type lives in outlet.ts
export interface OutletSummary {
  id : string
  name : string
  cityId : string
  adminStatus : string
  isMainStore : boolean
  createdAt   : string
}






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


export interface CreateOutletRequest {
  name         : string
  addressLine1 : string
  addressLine2?: string
  cityId       : string
  neighborhood?: string
  postalCode?  : string
  latitude     : number
  longitude    : number
  phone?       : string
  email?       : string
  bio?         : string
  deliveryRadius? : number
  minimumOrder?   : number
  deliveryFee?    : number
}

export interface UpdateOutletRequest {
  name?        : string
  addressLine1?: string
  addressLine2?: string
  neighborhood?: string
  postalCode?  : string
  phone?       : string
  email?       : string
  bio?         : string
  deliveryRadius? : number
  minimumOrder?   : number
  deliveryFee?    : number
  // Coordinates may change if vendor corrects a pin — re-runs coordinate check
  latitude?    : number
  longitude?   : number
}

export interface OperatingHoursEntry {
  dayOfWeek : "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY"
  openTime  : string  // "08:00"
  closeTime : string 
  isClosed  : boolean
}

export interface AddPayoutAccountRequest {
  countryPaymentMethodId: string
  accountHolderName     : string
  // Mobile money
  mobileNetwork?  : string
  mobileNumber?   : string
  // Bank
  bankName?       : string
  branchName?     : string
  bankCode?       : string
  accountNumber?  : string
  swiftCode?      : string
  iban?           : string
  routingNumber?  : string
  // Digital wallets
  paypalEmail?    : string
  stripeAccountId?: string
}

export type idParam = { id: string }
