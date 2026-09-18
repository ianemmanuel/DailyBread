//* src/frontend/admin.ts


//* ─── Admin dashboard type exports ────────────────────────────────────────────
// This is the ONLY file Next.js dashboard components should import from.
//? Usage: import type { AdminSessionData } from "@repo/types/admin-dashboard"
//! Never import from @repo/types/backend — that file depends on Express.

//* API

export type { 
    SessionRole, 
    AdminSessionData, 
    SessionScope, 
    SessionScopeContext 
} from "../domain/admin"

export type { 
    CountryKPIs, 
    KPITrend, 
    CityKPIs, 
    OutletKPIs, 
    VendorKPIs, 
    KPIResult
} from "../domain/kpi"

export type { RegionBreakdown, RegionSummaryResult } from "../domain/region"

//* Vendor applications — review workflow (Vendor Applications vertical slice)
export type {
    AdminActionReason,
    RejectApplicationRequest,
    MarkApplicationNeedsRevisionRequest,
    ApproveApplicationResponse,
} from "../domain/admin"

//* ENUMS
export type { AdminPermissionKey } from "../enums/admin"
export { AdminPermissions } from "../enums/admin"
export type { AdminRoleName } from "../enums/admin"
export { AdminRoleNames } from "../enums/admin"
export { AdminUserStatus } from "../enums/admin"
export { AdminScopeType } from "../enums/admin"
export { VendorApplicationStatus } from "../enums/vendor"
export { DocumentStatus } from "../enums/document"

export type { ServiceAreaMode } from "../enums/geography"
export type { GeoStatus } from "../enums/geography"
export type { BoundarySource } from "../enums/geography"
export type { ZoneLevel } from "../enums/geography"
export type { ZoneOperationalStatus } from "../enums/geography"

//* DOMAIN TYPES

//* Geography
export type {
    Country,
    CountrySummaryResult,
    CountryListResult,
    CountryWithCities,
    CountryVendorSnapshot,
    CountryOnboardingLeaderboardEntry,
    UpdateCountryRequest,
} from "../domain/country"

//* Vendor types
export type {
    VendorTypeSummary,
    VendorTypeListResult,
    VendorTypeStats,
    VendorGoLiveStatus,
    VendorGoLiveBlocker,
    OutletGoLiveStatus,
    OutletClearanceStatus,
    OutletGoLiveBlocker,
    AdminOutletDocumentRow,
    OutletDocumentSeverity,
    VendorDocumentActionStatus,
    OutletInspectionPolicy,
    OutletInspectionStatus,
    OutletInspectionRow,
    AdminOutletInspectionRow,
    OutletInspectionListResult,
    OutletInspectionDetail,
    OutletMealPlanBlocker,
    OutletMealPlanReadiness,
} from "../domain/vendor"
export type { VendorTypeStatus } from "../enums/vendor"
export type {
    City,
    CityDetail,
    CityBoundaryData,
    CityBoundary,
    OsmPreviewResult,
    CreateCityRequest,
    UpdateCityRequest,
    CityOutletSnapshot,
    CityOutletLeaderboardEntry,
} from "../domain/city"

export type { ServiceArea } from "../domain/geography"
export type { DeliveryZone } from "../domain/geography"
export type { Zone } from "../domain/geography"
export type { ZoneListItem } from "../domain/geography"
export type { ZoneBoundary } from "../domain/geography"
export type { ZoneCapabilityFlags } from "../domain/geography"
export type { ResolvedCapabilities } from "../domain/geography"
export type { CreateZoneRequest } from "../domain/geography"
export type { UpdateZoneRequest } from "../domain/geography"
export type { SetZoneLevelRequest } from "../domain/geography"
export type { SetZoneOperationalStatusRequest } from "../domain/geography"
export type { MarketSignalType, MarketSignalStatus } from "../enums/geography"
export type {
  MarketSignal, MarketSignalBucket, MarketSignalZoneRow,
  CityMarketSignalSummary, MarketSignalListResult,
  CreateMarketSignalRequest, UpdateMarketSignalStatusRequest,
} from "../domain/geography"

export type { ServiceAreaBoundary } from "../domain/geography"
export type { DeliveryZoneBoundary } from "../domain/geography" 
export type { BoundingBox } from "../domain/geography"
export type { GeoPoint } from "../domain/geography"

//* Where one outlet sits, for the ERP's read-only outlet map.
export type {
  AdminOutletCoverage, AdminCoverageZone,
  OutletPlacement, OutletPlacementStatus, OutletPlacementCapabilities,
} from "../domain/geography"

export type { ApiSuccess, ApiErrorResponse } from "../shared/common"

//* Finance domain (Phase 1A + 1B).
export type {
  Money,
  Currency,
  CreateCurrencyRequest,
  UpdateCurrencyRequest,
  PaymentProvider,
  PaymentProviderListResult,
  CreatePaymentProviderRequest,
  UpdatePaymentProviderRequest,
  SetFinanceReferenceStatusRequest,
  CountryProviderAccount,
  CreateCountryProviderAccountRequest,
  UpdateCountryProviderAccountRequest,
  SuspendRequest,
  CountryFinancialConfig,
  SetBankVerificationProviderAccountRequest,
  SetBankVerificationModeRequest,
  SetOperationalSwitchesRequest,
  ReadinessCheck,
  FinancialReadiness,
  CountryFinancialConfigView,
  ProviderGatewayStatus,
  CountryPaymentMethodWithProvider,
  SetPaymentMethodProviderAccountRequest,
  ProviderWebhookEvent,
  ProviderBankListTestResult,
  ProviderCurrencyInfo,
  AdminPayoutAccountStatusFilter,
  AdminPayoutAccountListItem,
  AdminPayoutAccountListResult,
  AdminPayoutAccountAuditEntry,
  AdminPayoutAccountDetail,
  AdminPayoutProofDocument,
} from "../domain/finance"
export type { PayoutVerificationFailureCode, PayoutRiskFlag } from "../domain/vendor"
export {
  FinanceReferenceStatus,
  PaymentProviderCapability,
  PAYMENT_PROVIDER_CAPABILITIES,
  INTEGRATION_PROVIDER_CAPABILITIES,
  BUSINESS_PROVIDER_CAPABILITIES,
  PaymentEnvironment,
  CountryFinancialConfigStatus,
  BankVerificationMode,
  CountryProviderAccountStatus,
  ProviderWebhookEventStatus,
  FINANCIAL_READINESS_REASON_LABELS,
} from "../enums/finance"
export type { FinancialReadinessReason, NormalizedWebhookEventType } from "../enums/finance"
/* ── Marketing: storefront hero promotions ─────────────────────────────────
 *
 * What the ERP sends and receives. The IMAGE fields are read-only here on
 * purpose: the server derives them from the original it processed, so a write
 * payload has no way to name an object or claim a size.
 */

export type HeroPromotionScope = "CITY" | "COUNTRY" | "GLOBAL"
export type HeroPromotionStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED"

export interface HeroPromotionImage {
  url: string
  width: number | null
  height: number | null
  blurDataUrl: string | null
  alt: string | null
}

export interface HeroPromotion {
  id: string
  scope: HeroPromotionScope
  cityId: string | null
  countryId: string | null
  eyebrow: string | null
  headline: string
  subheadline: string | null
  ctaLabel: string | null
  ctaHref: string | null
  image: HeroPromotionImage | null
  imageWidth: number | null
  imageHeight: number | null
  imageBlurDataUrl: string | null
  imageAlt: string | null
  status: HeroPromotionStatus
  priority: number
  startsAt: string | null
  endsAt: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  city: { id: string; name: string; slug: string } | null
  country: { id: string; name: string; slug: string } | null
}

export interface HeroPromotionList {
  items: HeroPromotion[]
  page: number
  pageSize: number
  total: number
}

export interface HeroPromotionPresignResponse {
  uploadUrl: string
  storageKey: string
}
