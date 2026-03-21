import { VendorStatus, VendorApplicationStatus, VendorTypeStatus } from "../enums/vendor"
import { GeoStatus } from "../enums/geography"

// ─── Vendor type ──────────────────────────────────────────────────────────────

export interface VendorType {
  id               : string
  name             : string
  description      : string | null
  status           : VendorTypeStatus
  createdByAdminId : string | null
  deletedAt        : string | null
  createdAt        : string
  updatedAt        : string
}

export interface VendorTypeCountry {
  id               : string
  countryId        : string
  vendorTypeId     : string
  status           : GeoStatus
  createdByAdminId : string | null
  createdAt        : string
  updatedAt        : string
}

// ─── Vendor application ───────────────────────────────────────────────────────

export interface VendorApplication {
  id                : string
  userId            : string | null
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
  status            : VendorApplicationStatus
  revisionCount     : number
  rejectionReason   : string | null
  revisionNotes     : string | null
  submittedAt       : string | null
  reviewedAt        : string | null
  approvedAt        : string | null
  createdAt         : string
  updatedAt         : string
}

export interface VendorApplicationWithDetails extends VendorApplication {
  vendorType : VendorType
  documents  : VendorDocument[]
}

// ─── Vendor account ───────────────────────────────────────────────────────────

export interface VendorAccount {
  id                    : string
  userId                : string | null
  vendorTypeId          : string
  otherVendorType       : string | null
  countryId             : string
  applicationId         : string
  status                : VendorStatus
  legalBusinessName     : string
  businessEmail         : string
  businessPhone         : string
  companyRegNumber      : string | null
  taxRegistrationNumber : string | null
  taxIdType             : string | null
  ownerFirstName        : string
  ownerLastName         : string
  ownerPhone            : string | null
  ownerEmail            : string | null
  businessAddress       : string
  addressLine2          : string | null
  postalCode            : string | null
  addressVerified       : boolean
  suspensionReason      : string | null
  suspendedAt           : string | null
  suspensionUntil       : string | null
  deactivatedAt         : string | null
  deletedAt             : string | null
  createdAt             : string
  updatedAt             : string
}

export interface VendorAccountWithDetails extends VendorAccount {
  vendorType    : VendorType
  vendorProfile : VendorProfile | null
  outlets       : OutletSummary[]
}

// ─── Vendor profile ───────────────────────────────────────────────────────────

export interface VendorProfile {
  id                  : string
  vendorAccountId     : string
  displayName         : string
  tagline             : string | null
  description         : string | null
  logoUrl             : string | null
  coverImageUrl       : string | null
  publicEmail         : string | null
  publicPhone         : string | null
  website             : string | null
  isVerifiedBadge     : boolean
  isTopRated          : boolean
  isCommunityFavorite : boolean
  isPublished         : boolean
  isFeatured          : boolean
  totalReviews        : number
  averageRating       : number
  publishedAt         : string | null
  createdAt           : string
  updatedAt           : string
}

// ─── Vendor document ──────────────────────────────────────────────────────────
// Imported here to avoid circular imports — document.ts imports from vendor.ts
// would create a cycle. Keep document types here for vendor-related documents.

import { DocumentStatus } from "../enums/document"

export interface VendorDocument {
  id              : string
  applicationId   : string | null
  vendorId        : string | null
  documentTypeId  : string
  documentNumber  : string | null
  storageKey      : string
  documentName    : string | null
  fileSize        : number | null
  mimeType        : string | null
  issueDate       : string | null
  expiryDate      : string | null
  status          : DocumentStatus
  uploadedAt      : string
  reviewedAt      : string | null
  approvedAt      : string | null
  rejectedAt      : string | null
  rejectionReason : string | null
  revisionNotes   : string | null
  supersededBy    : string | null
  supersededAt    : string | null
  version         : number
  createdAt       : string
  updatedAt       : string
}

// Minimal outlet shape used as a relation on VendorAccount
// Full Outlet type lives in outlet.ts
export interface OutletSummary {
  id          : string
  name        : string
  cityId      : string
  adminStatus : string
  isMainStore : boolean
  createdAt   : string
}