/*
 * Finance domain contracts — Phase 1A (platform financial configuration
 * foundation). See apps/backend/src/modules/finance.
 *
 * Only reference-data shapes so far: Currency + PaymentProvider catalog.
 * CountryFinancialConfig / CountryProviderAccount / payments / payouts /
 * ledger are later phases and deliberately absent.
 */

import type {
  FinanceReferenceStatus,
  PaymentProviderCapability,
  PaymentEnvironment,
  CountryFinancialConfigStatus,
  BankVerificationMode,
  CountryProviderAccountStatus,
  FinancialReadinessReason,
  ProviderWebhookEventStatus,
  NormalizedWebhookEventType,
} from "../enums/finance"
import type { PayoutVerificationFailureCode, PayoutRiskFlag } from "./vendor"

//* ─── Money ──────────────────────────────────────────────────────────────
//* The canonical representation of a monetary amount everywhere in the
//* finance domain: an integer number of a currency's minor unit, plus the
//* currency it is denominated in. Never a float, never currency-less.
export interface Money {
  /** Integer count of the currency's minor unit (e.g. 10000 = KES 100.00). */
  amountMinor: number
  /** ISO-4217 code, uppercase — must resolve to a Currency row. */
  currency: string
}

//* ─── Currency reference ─────────────────────────────────────────────────

export interface Currency {
  code: string
  name: string
  symbol: string | null
  minorUnitDigits: number
  status: FinanceReferenceStatus
  createdByAdminId: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateCurrencyRequest {
  code: string
  name: string
  symbol?: string
  minorUnitDigits?: number
}

export interface UpdateCurrencyRequest {
  name?: string
  symbol?: string
  minorUnitDigits?: number
}

//* ─── PaymentProvider catalog ────────────────────────────────────────────

export interface PaymentProvider {
  id: string
  code: string
  name: string
  status: FinanceReferenceStatus
  capabilities: PaymentProviderCapability[]
  methodTypes: string[]
  supportedCurrencies: string[]
  description: string | null
  createdByAdminId: string | null
  createdAt: string
  updatedAt: string
}

export interface PaymentProviderListResult {
  providers: PaymentProvider[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CreatePaymentProviderRequest {
  code: string
  name: string
  capabilities: PaymentProviderCapability[]
  methodTypes?: string[]
  supportedCurrencies?: string[]
  description?: string
}

export interface UpdatePaymentProviderRequest {
  name?: string
  capabilities?: PaymentProviderCapability[]
  methodTypes?: string[]
  supportedCurrencies?: string[]
  description?: string
}

export interface SetFinanceReferenceStatusRequest {
  status: FinanceReferenceStatus
}

//* ─── Phase 1B — country provider account ────────────────────────────────

export interface CountryProviderAccount {
  id: string
  countryId: string
  paymentProviderId: string
  environment: PaymentEnvironment
  /** Non-secret reference; the secret bundle itself is never returned. */
  secretAlias: string
  enabledCapabilities: PaymentProviderCapability[]
  accountLabel: string | null
  externalAccountId: string | null
  status: CountryProviderAccountStatus
  activatedAt: string | null
  suspendedAt: string | null
  suspensionReason: string | null
  disabledAt: string | null
  createdByAdminId: string | null
  createdAt: string
  updatedAt: string
  /** Present when the endpoint joins it. */
  paymentProvider?: {
    id: string
    code: string
    name: string
    status: FinanceReferenceStatus
    capabilities: PaymentProviderCapability[]
  }
  /**
   * Whether this account's provider lists the country's currency among its
   * supported currencies. Present only on the ERP financial-config view —
   * computed per account, since a country may route different capabilities
   * through different providers with different currency support.
   */
  currencySupported?: boolean
}

export interface CreateCountryProviderAccountRequest {
  paymentProviderId: string
  environment: PaymentEnvironment
  /** Business capabilities only — integration ones are merged in server-side. */
  enabledCapabilities: PaymentProviderCapability[]
  accountLabel?: string
  externalAccountId?: string
}

export interface UpdateCountryProviderAccountRequest {
  /** Business capabilities only — integration ones are merged in server-side. */
  enabledCapabilities?: PaymentProviderCapability[]
  accountLabel?: string
  externalAccountId?: string
  /** Structural — global-scope only. Re-derives the (non-secret) secret alias. */
  environment?: PaymentEnvironment
}

/** Result of a pre-activation provider connectivity test (bank directory). */
export interface ProviderBankListTestResult {
  provider: string
  environment: PaymentEnvironment
  countryCode: string
  banks: { code: string; name: string }[]
  count: number
}

export interface SuspendRequest {
  reason: string
}

//* ─── Phase 1B — country financial config ───────────────────────────────

export interface CountryFinancialConfig {
  id: string
  countryId: string
  currencyCode: string | null
  /**
   * Explicit country-global routing binding for the bank-account
   * verification / resolution capability (BANK_ACCOUNT_RESOLUTION +
   * BANK_LIST). Independent of collection/payout routing — never inferred
   * from a payment method's provider account. Null = no automatic bank
   * verification configured for this country yet.
   */
  bankVerificationProviderAccountId: string | null
  /**
   * HOW this country verifies vendor bank payout accounts — distinct from
   * the binding above, which says WHO does it.
   *   PROVIDER — automatic; a usable bank-verification provider account is
   *     required and financial readiness fails without one.
   *   MANUAL   — no provider can resolve a bank account in this market, so
   *     the vendor uploads a proof document (a PAYOUT_ACCOUNT-scoped
   *     document type) and an admin verifies it by hand. A legitimate
   *     operating mode: readiness passes without a bound account.
   * No fallback between the two — see BankVerificationMode.
   */
  bankVerificationMode: BankVerificationMode
  collectionsEnabled: boolean
  payoutsEnabled: boolean
  status: CountryFinancialConfigStatus
  activatedAt: string | null
  suspendedAt: string | null
  suspensionReason: string | null
  disabledAt: string | null
  createdByAdminId: string | null
  createdAt: string
  updatedAt: string
  currency?: Currency | null
  bankVerificationProviderAccount?: CountryProviderAccount | null
}

/** Set (or clear, with null) the country's bank-verification routing binding. */
export interface SetBankVerificationProviderAccountRequest {
  providerAccountId: string | null
}

/** Switch the country between automatic and document-backed manual verification. */
export interface SetBankVerificationModeRequest {
  mode: BankVerificationMode
}

export interface SetOperationalSwitchesRequest {
  collectionsEnabled?: boolean
  payoutsEnabled?: boolean
}

//* ─── Phase 1B — readiness ──────────────────────────────────────────────

export interface ReadinessCheck {
  ready: boolean
  reasons: FinancialReadinessReason[]
}

export interface FinancialReadiness {
  countryId: string
  collection: ReadinessCheck
  payout: ReadinessCheck
  bankVerification: ReadinessCheck
  financiallyReady: boolean
  /** Deduped union of every failing reason — for country-activation display. */
  reasons: FinancialReadinessReason[]
}

/**
 * How a payment provider represents the country's currency, and whether it
 * supports it. Computed in the finance/provider layer — the admin never
 * picks a provider-specific currency. Currency support is per provider
 * account (see CountryProviderAccount.currencySupported on the config view).
 */
export interface ProviderCurrencyInfo {
  /** ISO-4217 alpha code (the country's canonical currency). */
  iso: string
  /** The exact token sent to the provider's API (pass-through for every current provider). */
  providerRepresentation: string
  /** Whether the provider's catalog lists this currency (empty list = unrestricted). */
  supported: boolean
  /** Display name of the provider. */
  providerName: string
}

export interface CountryFinancialConfigView {
  config: CountryFinancialConfig | null
  /** Every provider account for the country. `currencySupported` is populated per account. */
  providerAccounts: CountryProviderAccount[]
  readiness: FinancialReadiness
  /** Phase 1C — can this country reach its bank-verification provider (no network check). */
  providerGateway: ProviderGatewayStatus
  /** Phase 1C — payment methods and which provider account (if any) executes each. */
  paymentMethods: CountryPaymentMethodWithProvider[]
  /** The country's currency string — shown read-only; config.currency is the resolved reference row. */
  countryCurrency: string
  /** What the current admin may do, given permission + scope. */
  canManageDraft: boolean
  canManageLifecycle: boolean
}

//* ─── Phase 1C — provider wiring ────────────────────────────────────────

/**
 * No-network status of the country's BANK-ACCOUNT-VERIFICATION provider
 * route (CountryFinancialConfig.bankVerificationProviderAccountId) — the
 * one country-global provider integration surfaced on the ERP config view.
 * `configured: false` means no bank-verification account is bound yet.
 */
export interface ProviderGatewayStatus {
  configured: boolean
  providerCode: string | null
  environment: PaymentEnvironment | null
  /** A concrete adapter is registered for the provider code. */
  adapterRegistered: boolean
  /** The account's secret alias resolves to a credential bundle. */
  credentialsResolvable: boolean
  enabledCapabilities: string[]
  blockers: string[]
}

export interface CountryPaymentMethodWithProvider {
  id: string
  countryId: string
  direction: "INBOUND" | "OUTBOUND"
  status: string
  countryProviderAccountId: string | null
  displayOrder: number
  paymentMethod: {
    id: string
    code: string
    name: string
    type: string
  }
  countryProviderAccount: {
    id: string
    status: CountryProviderAccountStatus
    environment: PaymentEnvironment
    accountLabel: string | null
    enabledCapabilities: PaymentProviderCapability[]
    paymentProvider: { code: string; name: string; status: FinanceReferenceStatus }
  } | null
}

export interface SetPaymentMethodProviderAccountRequest {
  countryProviderAccountId: string | null
}

//* ─── Phase 1C — recorded provider webhook event ────────────────────────

export interface ProviderWebhookEvent {
  id: string
  provider: string
  providerEventId: string
  eventType: NormalizedWebhookEventType | string
  providerRef: string | null
  countryProviderAccountId: string | null
  status: ProviderWebhookEventStatus
  receivedAt: string
  processedAt: string | null
}

//* ─── Finance → Vendor Payout Accounts (operational verification queue) ──
//* Safe, cross-vendor view of a vendor payout account for a finance/
//* compliance admin. Never carries a full account number or any encrypted /
//* raw-provider value — the backend masks before this leaves it.

export type AdminPayoutAccountStatusFilter =
  | "PENDING" | "VERIFIED" | "FAILED" | "REQUIRES_REVIEW" | "DEACTIVATED"

export interface AdminPayoutAccountListItem {
  id                : string
  vendorId          : string
  vendorName        : string
  countryName       : string
  countryCode       : string
  currency          : string
  methodType        : string
  methodName        : string
  providerName      : string | null
  environment       : string | null
  bankName          : string | null
  branchName        : string | null
  accountHolderName : string | null
  maskedAccount     : string
  verificationStatus: "PENDING" | "VERIFIED" | "FAILED" | "REQUIRES_REVIEW"
  verificationFailureCode: PayoutVerificationFailureCode | null
  verificationMethod: string | null
  failureReason     : string | null
  riskFlags         : PayoutRiskFlag[]
  nameMatchScore    : number | null
  isActive          : boolean
  isDefault         : boolean
  verifiedAt        : string | null
  createdAt         : string
  updatedAt         : string
}

export interface AdminPayoutAccountListResult {
  accounts : AdminPayoutAccountListItem[]
  total    : number
  page     : number
  pageSize : number
  counts   : { pending: number; failed: number; requiresReview: number; verified: number; deactivated: number }
}

export interface AdminPayoutAccountAuditEntry {
  id       : string
  action   : string
  actor    : string | null
  createdAt: string
  changes  : unknown
  metadata : unknown
}

/*
 * Proof of bank-account ownership, uploaded by the vendor where their
 * country verifies manually (no provider can resolve a bank account there).
 * This document IS the evidence the reviewer decides on: it must show the
 * account holder's name and number and be stamped by the bank. `viewUrl` is
 * a short-lived signed URL, same as every other admin document preview.
 * Always empty for countries that verify automatically.
 */
export interface AdminPayoutProofDocument {
  id          : string
  documentName: string | null
  typeName    : string
  instructions: string | null
  mimeType    : string | null
  fileSize    : number | null
  status      : string
  uploadedAt  : string
  viewUrl     : string
}

export interface AdminPayoutAccountDetail {
  account            : AdminPayoutAccountListItem
  /** Provider bank code, decrypted for the reviewer. Detail view only —
   *  it names the bank (already shown by name), not the account. */
  bankCode           : string | null
  /** Admin who last approved or rejected this account, and when. */
  reviewedBy         : string | null
  reviewedAt         : string | null
  /** Derived review workflow state — see payoutReviewState (backend). */
  reviewState        : "UNCLAIMED" | "CLAIMED" | "ESCALATED" | "RESOLVED"
  assignedReviewerId : string | null
  assignedTo         : string | null
  escalatedAt        : string | null
  escalationReason   : string | null
  claimedFromEscalation: boolean
  proofDocuments     : AdminPayoutProofDocument[]
  canVerify          : boolean
  verifyBlockedReason: string | null
  /** First page only — see auditTotal / auditPageSize and the audit endpoint. */
  audit              : AdminPayoutAccountAuditEntry[]
  auditTotal         : number
  auditPageSize      : number
}
