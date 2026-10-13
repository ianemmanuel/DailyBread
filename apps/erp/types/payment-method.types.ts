// Mirrors backend PaymentMethod / CountryPaymentMethod shapes
// (apps/backend/src/modules/admin/services/admin.paymentMethod.service.ts).
// Roadmap "Payment gateway infrastructure" (CLAUDE.md, 2026-08-26).

export type PaymentMethodType = "MOBILE_MONEY" | "BANK" | "DIGITAL_WALLET" | "CARD"
export type PaymentDirection  = "INBOUND" | "OUTBOUND"
export type CountryPaymentMethodStatus = "ACTIVE" | "INACTIVE" | "DEPRECATED"

export interface PaymentMethod {
  id               : string
  code             : string
  name             : string
  type             : PaymentMethodType
  direction        : PaymentDirection[]
  logoUrl          : string | null
  description      : string | null
  isActive         : boolean
  createdByAdminId : string | null
  createdAt        : string
  countryConfigCount?: number
}

export interface PaymentMethodListResult {
  methods   : PaymentMethod[]
  total     : number
  page      : number
  pageSize  : number
  totalPages: number
}

export interface CountryPaymentMethodConfig {
  id                       : string
  countryId                : string
  paymentMethodId          : string
  direction                : PaymentDirection
  status                   : CountryPaymentMethodStatus
  displayOrder             : number
  countryProviderAccountId : string | null
  createdByAdminId         : string | null
  createdAt                : string
  paymentMethod: { id: string; code: string; name: string; type: PaymentMethodType; logoUrl: string | null; isActive: boolean }
  /** Which provider account executes this method — wired on the country Finance page. */
  countryProviderAccount: {
    id: string
    environment: "TEST" | "LIVE"
    status: "DRAFT" | "ACTIVE" | "SUSPENDED" | "DISABLED"
    paymentProvider: { code: string; name: string }
  } | null
}
