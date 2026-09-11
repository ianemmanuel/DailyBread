import { prisma, Prisma, type PayoutVerificationStatus } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/errors/ApiError"
import { resolveCountryIdInScope } from "@/modules/admin/lib/scope/resolve-country-id"
import { presentPayoutAccount } from "@/modules/vendor/services/vendor.payoutPresentation"
import { R2Service } from "@/lib/r2/r2.service"
import { decryptOptional } from "@/lib/crypto/field-encryption"
import { canManuallyVerify } from "./admin.vendor.payout.service"
import { payoutReviewState } from "./admin.payoutReview.state"

/*
 * Finance-domain, cross-vendor view of vendor payout accounts and their
 * verification state — the operational home for a finance/compliance admin
 * (Finance → Vendor Payout Accounts). READ is gated on FINANCE_PAYOUTS_READ;
 * the verify/reject actions reuse the existing VENDORS_PAYOUT_ACCOUNTS_MANAGE
 * path (admin.vendor.payout.service.ts) so there's exactly one code path and
 * one audit trail per action.
 *
 * Scope: a country-scoped admin only ever sees accounts whose vendor is in
 * their country (enforced in the WHERE clause here — never trusted from a
 * query param). Global admins see all. Every identifier that reaches a
 * client goes through presentPayoutAccount() — the same single masking
 * boundary the vendor endpoints use; a raw account number never leaves the
 * backend.
 */

const LIST_INCLUDE = {
  vendor: {
    select: {
      id: true,
      countryId: true,
      legalBusinessName: true,
      country: { select: { name: true, code: true, currency: true } },
    },
  },
  countryPaymentMethod: {
    include: {
      paymentMethod: { select: { name: true, type: true, code: true } },
      countryProviderAccount: {
        select: { paymentProvider: { select: { name: true } }, environment: true },
      },
    },
  },
} as const

type PayoutRow = Prisma.VendorPayoutAccountGetPayload<{ include: typeof LIST_INCLUDE }>

function maskedIdentifier(masked: Record<string, unknown> | null, row: PayoutRow): string {
  const m = masked ?? {}
  return (
    (typeof m.accountNumber === "string" && m.accountNumber) ||
    (typeof m.iban === "string" && m.iban) ||
    (typeof m.mobileNumber === "string" && m.mobileNumber) ||
    row.paypalEmail ||
    row.stripeAccountId ||
    "—"
  )
}

function toListItem(row: PayoutRow) {
  const presented = presentPayoutAccount(row, { includeRiskSignals: true })
  return {
    id                : row.id,
    vendorId          : row.vendorId,
    vendorName        : row.vendor.legalBusinessName,
    countryName       : row.vendor.country.name,
    countryCode       : row.vendor.country.code,
    currency          : row.vendor.country.currency,
    methodType        : row.countryPaymentMethod.paymentMethod.type,
    methodName        : row.countryPaymentMethod.paymentMethod.name,
    providerName      : row.countryPaymentMethod.countryProviderAccount?.paymentProvider.name ?? null,
    environment       : row.countryPaymentMethod.countryProviderAccount?.environment ?? null,
    bankName          : row.bankName,
    branchName        : row.branchName,
    accountHolderName : row.accountHolderName,
    maskedAccount     : maskedIdentifier(presented.masked as Record<string, unknown> | null, row),
    verificationStatus: row.verificationStatus,
    verificationFailureCode: row.verificationFailureCode,
    verificationMethod: row.verificationMethod,
    failureReason     : row.failureReason,
    riskFlags         : row.riskFlags,
    nameMatchScore    : row.nameMatchScore,
    isActive          : row.isActive,
    isDefault         : row.isDefault,
    verifiedAt        : row.verifiedAt?.toISOString() ?? null,
    createdAt         : row.createdAt.toISOString(),
    updatedAt         : row.updatedAt.toISOString(),
  }
}

export type AdminPayoutAccountListItem = ReturnType<typeof toListItem>

export interface ListPayoutAccountsFilters {
  status?    : PayoutVerificationStatus | "DEACTIVATED"
  countryRef?: string
  search?    : string
  page?      : number
  pageSize?  : number
}

export async function listVendorPayoutAccounts(filters: ListPayoutAccountsFilters, scope: AdminScopeContext) {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))

  // Country constraint — never trusted from the query param: a country-scoped
  // admin is always pinned to their own countries, and an explicit
  // countryRef is resolved *within* that scope (404s if out of scope).
  const scopedCountryIds = scope.isGlobal ? null : scope.countryIds
  const requestedCountryId = filters.countryRef
    ? await resolveCountryIdInScope(filters.countryRef, scope)
    : null

  const vendorWhere: Prisma.VendorAccountWhereInput = {}
  if (requestedCountryId) vendorWhere.countryId = requestedCountryId
  else if (scopedCountryIds) vendorWhere.countryId = { in: scopedCountryIds }

  const baseWhere: Prisma.VendorPayoutAccountWhereInput =
    Object.keys(vendorWhere).length > 0 ? { vendor: vendorWhere } : {}

  const where: Prisma.VendorPayoutAccountWhereInput = { ...baseWhere }

  // "DEACTIVATED" is a lifecycle state, not a verificationStatus — a
  // soft-deleted / replaced account. Every other filter is over live rows.
  if (filters.status === "DEACTIVATED") {
    where.deletedAt = { not: null }
  } else {
    where.deletedAt = null
    if (filters.status) where.verificationStatus = filters.status
  }

  /*
   * Search matches vendor name, bank name or account-holder name. Built
   * once and applied to BOTH the page query and the per-status tab counts:
   * a search that only narrowed the rows made the tabs lie about where the
   * matches were, so searching a vendor whose account sits under a
   * different status than the current tab looked like "search is broken".
   * baseWhere still ANDs against every branch — search only widens WITHIN
   * the caller's country scope, never past it.
   */
  const searchOr = filters.search?.trim()
    ? [
        { vendor: { legalBusinessName: { contains: filters.search.trim(), mode: "insensitive" as const } } },
        { bankName: { contains: filters.search.trim(), mode: "insensitive" as const } },
        { accountHolderName: { contains: filters.search.trim(), mode: "insensitive" as const } },
      ]
    : null
  if (searchOr) where.OR = searchOr

  const countWhere: Prisma.VendorPayoutAccountWhereInput = searchOr ? { ...baseWhere, OR: searchOr } : baseWhere

  const [rows, total, pending, failed, requiresReview, verified, deactivated] = await Promise.all([
    prisma.vendorPayoutAccount.findMany({
      where,
      include: LIST_INCLUDE,
      orderBy: [{ createdAt: "desc" }],
      skip   : (page - 1) * pageSize,
      take   : pageSize,
    }),
    prisma.vendorPayoutAccount.count({ where }),
    prisma.vendorPayoutAccount.count({ where: { ...countWhere, deletedAt: null, verificationStatus: "PENDING" } }),
    prisma.vendorPayoutAccount.count({ where: { ...countWhere, deletedAt: null, verificationStatus: "FAILED" } }),
    prisma.vendorPayoutAccount.count({ where: { ...countWhere, deletedAt: null, verificationStatus: "REQUIRES_REVIEW" } }),
    prisma.vendorPayoutAccount.count({ where: { ...countWhere, deletedAt: null, verificationStatus: "VERIFIED" } }),
    prisma.vendorPayoutAccount.count({ where: { ...countWhere, deletedAt: { not: null } } }),
  ])

  return {
    accounts: rows.map(toListItem),
    total,
    page,
    pageSize,
    counts: { pending, failed, requiresReview, verified, deactivated },
  }
}

export interface PayoutAccountAuditEntry {
  id       : string
  action   : string
  actor    : string | null
  createdAt : string
  changes  : unknown
  metadata : unknown
}

/*
 * The audit trail grows for the life of the account — every claim, release,
 * escalation, reassignment and verdict — so the detail page reads it a page at
 * a time rather than dumping the last 50 and silently hiding the rest.
 */
export const PAYOUT_AUDIT_PAGE_SIZE = 10

export interface PayoutAuditPage {
  entries   : PayoutAccountAuditEntry[]
  total     : number
  page      : number
  pageSize  : number
  totalPages: number
}

function toAuditEntry(a: {
  id: string; action: string; createdAt: Date; changes: unknown; metadata: unknown
  adminUser: { firstName: string; lastName: string; email: string } | null
}): PayoutAccountAuditEntry {
  return {
    id       : a.id,
    action   : a.action,
    actor    : a.adminUser ? `${a.adminUser.firstName} ${a.adminUser.lastName}`.trim() || a.adminUser.email : null,
    createdAt: a.createdAt.toISOString(),
    changes  : a.changes,
    metadata : a.metadata,
  }
}

/**
 * One page of an account's audit trail. Scope is re-checked here rather than
 * trusted from the detail call — this is its own endpoint, and an accountId is
 * the only thing a caller supplies.
 */
export async function getPayoutAccountAuditPage(
  accountId: string,
  scope    : AdminScopeContext,
  page     : number,
): Promise<PayoutAuditPage> {
  const row = await prisma.vendorPayoutAccount.findUnique({
    where : { id: accountId },
    select: { id: true, vendor: { select: { countryId: true } } },
  })
  if (!row) throw new ApiError(404, "Payout account not found", "NOT_FOUND")
  if (!scope.isGlobal && !scope.countryIds.includes(row.vendor.countryId)) {
    throw new ApiError(404, "Payout account not found", "NOT_FOUND")
  }

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const where = { entityType: "VendorPayoutAccount", entityId: accountId }

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip   : (safePage - 1) * PAYOUT_AUDIT_PAGE_SIZE,
      take   : PAYOUT_AUDIT_PAGE_SIZE,
      include: { adminUser: { select: { firstName: true, lastName: true, email: true } } },
    }),
  ])

  return {
    entries   : rows.map(toAuditEntry),
    total,
    page      : safePage,
    pageSize  : PAYOUT_AUDIT_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAYOUT_AUDIT_PAGE_SIZE)),
  }
}

export async function getVendorPayoutAccountForReview(accountId: string, scope: AdminScopeContext) {
  const row = await prisma.vendorPayoutAccount.findUnique({ where: { id: accountId }, include: LIST_INCLUDE })
  // A soft-deleted account is still viewable for its history (§8) — only
  // scope hides it, and it hides identically to a genuinely missing id.
  if (!row) throw new ApiError(404, "Payout account not found", "NOT_FOUND")
  if (!scope.isGlobal && !scope.countryIds.includes(row.vendor.countryId)) {
    throw new ApiError(404, "Payout account not found", "NOT_FOUND")
  }

  // The first page only — the rest is paged in on demand via
  // getPayoutAccountAuditPage, so opening an account with a long history
  // doesn't drag its whole trail through the initial render.
  const [auditTotal, auditRows] = await Promise.all([
    prisma.auditLog.count({ where: { entityType: "VendorPayoutAccount", entityId: accountId } }),
    prisma.auditLog.findMany({
      where  : { entityType: "VendorPayoutAccount", entityId: accountId },
      orderBy: { createdAt: "desc" },
      take   : PAYOUT_AUDIT_PAGE_SIZE,
      include: { adminUser: { select: { firstName: true, lastName: true, email: true } } },
    }),
  ])

  const assignee = row.assignedReviewerId
    ? await prisma.adminUser.findUnique({
        where : { id: row.assignedReviewerId },
        select: { firstName: true, lastName: true, email: true },
      })
    : null

  const reviewer = row.reviewedById
    ? await prisma.adminUser.findUnique({
        where : { id: row.reviewedById },
        select: { firstName: true, lastName: true, email: true },
      })
    : null

  const gate = canManuallyVerify(row)

  /*
   * Proof of bank-account ownership — the MANUAL verification path. In
   * markets with no bank-resolution provider (Kenya/KES) this document IS
   * the evidence the reviewer decides on: it must show the account holder's
   * name and number, and be stamped by the bank. Surfaced inline with a
   * short-lived signed URL, same mechanism as every other admin document
   * preview. Empty for PROVIDER-mode countries, which never ask for one.
   */
  const proofRows = await prisma.vendorDocument.findMany({
    where  : { payoutAccountId: accountId },
    orderBy: { uploadedAt: "desc" },
    include: { documentType: { select: { name: true, instructions: true } } },
  })
  const proofDocuments = await Promise.all(
    proofRows.map(async (d) => ({
      id          : d.id,
      documentName: d.documentName,
      typeName    : d.documentType.name,
      instructions: d.documentType.instructions,
      mimeType    : d.mimeType,
      fileSize    : d.fileSize,
      status      : d.status,
      uploadedAt  : d.uploadedAt.toISOString(),
      viewUrl     : await R2Service.generateViewUrl(d.storageKey),
    })),
  )

  return {
    account: toListItem(row),
    /*
     * The provider bank code, decrypted for the reviewer.
     *
     * It is stored encrypted only because it sits alongside the genuinely
     * sensitive identifiers — but a bank code names the BANK, not the
     * account (e.g. "068" is Equity), and the bank NAME is already shown
     * in plaintext right next to it. Surfacing it adds no disclosure a
     * reviewer doesn't already have, and it is the exact value that will
     * be handed to the payout provider, so it has to be checkable. The
     * account NUMBER stays masked — that is the part worth protecting.
     * Detail view only; never in the cross-vendor list.
     */
    bankCode: decryptOptional(row.bankCode),
    /*
     * Who last approved or rejected this account, resolved to a name.
     * The audit log has always had it, but "who turned this down?"
     * shouldn't require reading an audit trail — same reviewer-on-the-
     * record convention as vendor applications.
     */
    reviewedBy: reviewer
      ? `${reviewer.firstName} ${reviewer.lastName}`.trim() || reviewer.email
      : null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    /*
     * Review workflow — derived, never stored (see payoutReviewState).
     * assignedTo is resolved to a name so the queue can say WHO holds it
     * rather than showing an opaque id.
     */
    reviewState       : payoutReviewState(row),
    assignedReviewerId: row.assignedReviewerId,
    assignedTo        : assignee
      ? `${assignee.firstName} ${assignee.lastName}`.trim() || assignee.email
      : null,
    escalatedAt       : row.escalatedAt?.toISOString() ?? null,
    escalationReason  : row.escalationReason,
    claimedFromEscalation: row.claimedFromEscalation,
    proofDocuments,
    canVerify: gate.ok,
    verifyBlockedReason: gate.ok ? null : gate.reason,
    audit: auditRows.map(toAuditEntry) satisfies PayoutAccountAuditEntry[],
    auditTotal,
    auditPageSize: PAYOUT_AUDIT_PAGE_SIZE,
  }
}
