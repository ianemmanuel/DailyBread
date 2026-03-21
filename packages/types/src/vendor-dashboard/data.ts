
//* Represents a country for onboarding dropdowns
export interface Country {
  id: string
  name: string
  code: string
  currency: string
  phoneCode: string
  currencySymbol?: string | null
}

//* Represents a vendor type for dropdowns
export interface VendorType {
  id: string
  name: string
  description?: string | null
}

//* Represents a vendor application, with only the fields we care about
export interface Application {
  id: string
  userId?: string | null
  countryId: string
  vendorTypeId: string
  otherVendorType?: string | null
  legalBusinessName: string
  registrationNumber?: string | null
  taxId?: string | null
  businessEmail: string
  businessPhone?: string | null
  ownerFirstName: string
  ownerLastName: string
  ownerPhone?: string | null
  ownerEmail?: string | null
  businessAddress: string
  addressLine2?: string | null
  postalCode?: string | null
  status: "DRAFT" | "SUBMITTED" | "REVIEWED" | "APPROVED" | "REJECTED"
  submittedAt?: string | null
  reviewedAt?: string | null
  approvedAt?: string | null
  approvedBy?: string | null
  reviewedBy?: string | null
  revisionCount: number
  rejectionReason?: string | null
  revisionNotes?: string | null
  createdAt: string
  updatedAt: string
  country?: Country
  vendorType?: VendorType
}