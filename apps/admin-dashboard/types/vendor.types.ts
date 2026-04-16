// Frontend-local types for the vendors module.
// These mirror the backend response shapes but live here because
// they're only used by the admin dashboard frontend.

export interface Doc {
  id          : string
  documentName: string | null
  storageKey  : string
  mimeType    : string | null
  status      : string
  expiryDate  : string | null
  documentType: { name: string }
}

export type ViewerState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "ready"; url: string }
  | { type: "error"; message: string }


export interface VendorApplicationListItem {
  id                : string
  legalBusinessName : string
  businessEmail     : string
  ownerFirstName    : string
  ownerLastName     : string
  status            : string
  submittedAt       : string | null
  createdAt         : string
  revisionCount     : number
  countryId         : string
  country?          : { id: string; name: string; code: string }
  vendorType?       : { id: string; name: string }
}

export interface ApplicationListResult {
  applications : VendorApplicationListItem[]
  total        : number
  page         : number
  pageSize     : number
  totalPages   : number
}

export interface VendorAccountListItem {
  id                : string
  legalBusinessName : string
  businessEmail     : string
  status            : string
  countryId         : string
  country?          : { id: string; name: string; code: string }
  vendorType?       : { id: string; name: string }
  createdAt         : string
  suspendedAt?      : string | null
  _count?           : { outlets: number }
}

export interface VendorListResult {
  accounts   : VendorAccountListItem[]
  total      : number
  page       : number
  pageSize   : number
  totalPages : number
}