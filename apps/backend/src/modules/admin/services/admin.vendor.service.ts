import {
  prisma,
  VendorApplicationStatus,
  VendorStatus,
  DocumentStatus,
  AdminUserStatus,
  AdminReviewAvailability,
  AdminScopeType,
  type VendorApplication,
} from "@repo/db"
import { ApiError } from "@/errors/ApiError"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import type { AdminScopeContext } from "@repo/types/backend"
import { AdminPermissions, type AdminPermissionKey } from "@repo/types/enums"
import { getCountryIdFromSlug } from "../helpers/get-country-id.helper"
import { assertAllRequiredDocumentsApproved } from "@/modules/vendor/services/vendor.document.service"
import { REQUIRED_APPLICATION_FIELDS } from "@/modules/vendor/schemas/vendor.application.schema"
import { ClerkVendorStateService } from "@/lib/clerk"
import { getVendorComplianceIssues, getVendorOperationalIssues } from "./admin.vendor.compliance.service"
import { getDuplicatePayoutFlags } from "./admin.vendor.payout.service"
import { presentPayoutAccount } from "@/modules/vendor/services/vendor.payout.service"
import { getVendorGoLiveStatus } from "@/modules/vendor/services/vendor.profile.service"
import { assertVendorDocumentReviewableByActor } from "./admin.vendor.compliance-case.service"
import { MAX_APPLICATION_PRIORITY_SCAN } from "@/constants/vendor"
import { toCsv } from "@/lib/csv"

function assertCountryInScope(countryId: string, scope: AdminScopeContext): void {
  if (!scope.isGlobal && !scope.countryIds.includes(countryId)) {
    throw new ApiError(403, "This application is outside your scope", "SCOPE_FORBIDDEN")
  }
}

/*
 * Ownership guard — applied to every review action (markUnderReview,
 * approve, reject, needs-revision). An unclaimed application (no
 * assignedReviewerId) is unaffected — anyone with the base action
 * permission may still act on it directly, same as before this
 * feature existed. Once claimed, only the assigned reviewer or an
 * admin holding the explicit reassignment permission may act — this
 * is the actual "remains responsible unless reassigned" rule.
 */
function assertReviewerOwnership(
  application: { assignedReviewerId: string | null; escalatedByAdminId?: string | null },
  actorId: string,
  actorPermissions: AdminPermissionKey[],
): void {
  // Permanent lock-out — the one rule that survives every future
  // claim/reassign on this application. Checked first, and unconditionally,
  // so REASSIGN or RECEIVE_ESCALATION can never be used to route an
  // escalated application back to the person who escalated it.
  if (application.escalatedByAdminId === actorId) {
    throw new ApiError(
      403,
      "You escalated this application and can no longer act on it",
      "ESCALATED_BY_YOU",
    )
  }

  if (!application.assignedReviewerId) {
    // Unclaimed + escalated = the open escalation pool, not the normal
    // "anyone with review can act" case — only admins who actually
    // receive escalations may pick it up from here.
    if (application.escalatedByAdminId && !actorPermissions.includes(AdminPermissions.VENDORS_APPLICATIONS_RECEIVE_ESCALATION)) {
      throw new ApiError(
        403,
        "This application was escalated and is only actionable by admins who receive escalations",
        "ESCALATION_RECEIVER_ONLY",
      )
    }
    return
  }
  if (application.assignedReviewerId === actorId) return
  if (actorPermissions.includes(AdminPermissions.VENDORS_APPLICATIONS_REASSIGN)) return

  throw new ApiError(
    403,
    "This application is assigned to another reviewer",
    "NOT_ASSIGNED_REVIEWER",
  )
}

/*
 * Shared eligibility check for anyone a reviewing responsibility can be
 * handed to — used by both reassignApplication (any active/available
 * reviewer with REVIEW capability + scope) and escalateApplication's
 * optional explicit target (same, plus RECEIVE_ESCALATION). Throws with
 * the specific reason rather than returning a boolean, since every
 * caller just wants to propagate a precise 400 anyway.
 */
async function assertEligibleReviewTarget(
  targetAdminId: string,
  countryId    : string,
  requireCapability: AdminPermissionKey = AdminPermissions.VENDORS_APPLICATIONS_REVIEW,
): Promise<void> {
  const target = await prisma.adminUser.findUnique({
    where : { id: targetAdminId },
    select: { id: true, status: true, reviewAvailability: true },
  })
  if (!target) throw new ApiError(404, "Target reviewer not found", "TARGET_NOT_FOUND")
  if (target.status !== AdminUserStatus.active) {
    throw new ApiError(400, "Target reviewer is not an active admin", "TARGET_INACTIVE")
  }
  if (target.reviewAvailability !== AdminReviewAvailability.AVAILABLE) {
    throw new ApiError(400, "Target reviewer is unavailable", "TARGET_UNAVAILABLE")
  }

  const hasCapability = await prisma.adminUserPermission.findFirst({
    where : { adminUserId: targetAdminId, permission: { key: requireCapability, isActive: true } },
    select: { id: true },
  })
  if (!hasCapability) {
    throw new ApiError(400, "Target reviewer does not have the required capability", "TARGET_NOT_CAPABLE")
  }

  const targetHasScope = await prisma.adminUserScope.findFirst({
    where: {
      adminUserId: targetAdminId,
      OR: [
        { scopeType: AdminScopeType.GLOBAL },
        { scopeType: AdminScopeType.COUNTRY, countryId },
        { scopeType: AdminScopeType.CITY, countryId },
      ],
    },
    select: { id: true },
  })
  if (!targetHasScope) {
    throw new ApiError(400, "Target reviewer does not have scope covering this application's country", "TARGET_OUT_OF_SCOPE")
  }
}

/*
 * Country-specific reason wins over global — same optional-narrower-
 * scope resolution as DocumentTypeConfig. findFirst, not findUnique —
 * same nullable-compound-unique typing workaround used throughout this
 * session's other new config lookups.
 */
async function resolveActionReason(code: string, countryId: string) {
  const specific = await prisma.adminActionReason.findFirst({
    where: { code, countryId, isActive: true },
  })
  if (specific) return specific

  const global = await prisma.adminActionReason.findFirst({
    where: { code, countryId: null, isActive: true },
  })
  if (global) return global

  throw new ApiError(404, "Unknown or inactive reason code", "INVALID_REASON_CODE")
}

/*
 * Type-narrowing guard, not a new business rule: an application can
 * only reach SUBMITTED/UNDER_REVIEW (the states approveApplication
 * accepts) by first passing this exact same completeness check in
 * submitApplication (vendor.application.service.ts). This should
 * never actually fire — it exists so approval can't silently write
 * null into VendorAccount's required columns if that invariant is
 * ever violated, and so TS can see these fields are non-null here.
 */
function assertApplicationCompleteForApproval(
  application: VendorApplication,
): asserts application is VendorApplication & {
  legalBusinessName: string
  businessEmail    : string
  ownerFirstName   : string
  ownerLastName    : string
  businessAddress  : string
} {
  const missing = REQUIRED_APPLICATION_FIELDS.filter((field) => !application[field])
  if (missing.length > 0) {
    throw new ApiError(
      400,
      `Cannot approve — application is missing required fields: ${missing.join(", ")}`,
      "APPLICATION_INCOMPLETE",
    )
  }
}

const serviceLog = logger.child({ module: "vendor-ops-service" })

//* Scope helper

// Exported for admin.vendor.compliance.service.ts's MISSING-document scan,
// which needs the same scope filter directly against VendorAccount rather
// than through the VendorDocument -> vendor relation.
export function buildVendorScopeFilter(scope: AdminScopeContext, requestedCountryId?: string) {
  if (scope.isGlobal) {
    return requestedCountryId ? { countryId: requestedCountryId } : {}
  }
  const allowedCountries = requestedCountryId && scope.countryIds.includes(requestedCountryId)
    ? [requestedCountryId]
    : scope.countryIds
  return { countryId: { in: allowedCountries } }
}

//* List applications

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  submittedAt      : "submittedAt",
  createdAt        : "createdAt",
  legalBusinessName: "legalBusinessName",
}

// Ranks used by sort=priority — needs-action statuses first (SUBMITTED
// hasn't been looked at yet at all; NEEDS_REVISION is the vendor's turn
// having just ended, so it's equally fresh to review), UNDER_REVIEW next
// (already someone's plate, less urgent to surface), terminal states last
// (nothing left to do). Anything not listed (DRAFT, in practice never
// reached — see the status filter above) sorts after everything.
const APPLICATION_PRIORITY_RANK: Record<string, number> = {
  SUBMITTED      : 0,
  NEEDS_REVISION : 0,
  UNDER_REVIEW   : 1,
  APPROVED       : 2,
  REJECTED       : 2,
}

interface ApplicationFilters {
  status?   : VendorApplicationStatus | VendorApplicationStatus[]
  countrySlug?: string
  search?   : string
  /*
   * Operational queues — thin filters over fields the review workflow
   * already tracks, not a new workflow concept. Always layered on top
   * of buildVendorScopeFilter below, never a substitute for it — a
   * country-scoped admin's "mine"/"unassigned"/"escalated" queues stay
   * confined to their own scope exactly like the unfiltered list.
   *   mine       — assignedReviewerId = actorId
   *   unassigned — no reviewer AND never escalated (a fresh, untouched application)
   *   escalated  — escalatedByAdminId set, regardless of current assignment
   */
  queue?    : "mine" | "unassigned" | "escalated"
}

//* Shared where-builder — used by both listApplications and
//* exportApplicationsCsv so the export can never drift from what the page
//* shows (same convention as detectAndFilterCandidates/buildAuditLogsWhere).
async function buildApplicationsWhere(filters: ApplicationFilters, adminScope: AdminScopeContext, actorId?: string) {
  const { status, countrySlug, search, queue } = filters

  // countrySlug is optional — most admins browse across their entire scope,
  // not one country at a time. Only resolve/narrow when one was actually
  // requested; resolving unconditionally previously meant an unscoped
  // request silently fell back to Prisma's findFirst() and narrowed every
  // list to a single arbitrary country.
  const countryId = countrySlug
    ? await getCountryIdFromSlug(countrySlug, adminScope)
    : undefined

  const queueFilter =
    queue === "mine" && actorId  ? { assignedReviewerId: actorId }
    : queue === "unassigned"    ? { assignedReviewerId: null, escalatedByAdminId: null }
    : queue === "escalated"     ? { escalatedByAdminId: { not: null } }
    : {}

  const where: any = {
    ...buildVendorScopeFilter(adminScope, countryId),
    // DRAFT applications are the vendor's own in-progress, unsubmitted
    // work — not yet visible to admins at all. Without an explicit status
    // filter, the default "browse everything" view must still exclude
    // them; an explicit filter (e.g. status=SUBMITTED) already does.
    ...(status
      ? Array.isArray(status) ? { status: { in: status } } : { status }
      : { status: { not: VendorApplicationStatus.DRAFT } }),
    ...queueFilter,
    ...(search ? {
      OR: [
        { legalBusinessName: { contains: search, mode: "insensitive" } },
        { businessEmail    : { contains: search, mode: "insensitive" } },
        { ownerFirstName   : { contains: search, mode: "insensitive" } },
        { ownerLastName    : { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  }
  return where
}

export async function listApplications(
  filters: ApplicationFilters & { sort?: string; dir?: string; page?: number; pageSize?: number },
  adminScope: AdminScopeContext,
  actorId?  : string,
) {

  const { page = 1, pageSize = 20 } = filters
  const sortColumn = ALLOWED_SORT_COLUMNS[filters.sort ?? ""] ?? "submittedAt"
  const sortDir    = filters.dir === "asc" ? "asc" : "desc"
  const skip       = (page - 1) * pageSize

  const where = await buildApplicationsWhere(filters, adminScope, actorId)

  const includeShape = {
    country   : { select: { id: true, name: true, code: true } },
    vendorType: { select: { id: true, name: true } },
    user      : { select: { id: true, email: true } },
    _count    : { select: { documents: true } },
  } as const

  if (filters.sort === "priority") {
    // Postgres can't express "SUBMITTED and NEEDS_REVISION tie for first,
    // then UNDER_REVIEW, then terminal" as a plain column sort — rank in
    // application code over a bounded window instead (same convention as
    // MAX_COMPLIANCE_VENDOR_SCAN's documented ceiling), then re-page.
    const total = await prisma.vendorApplication.count({ where })
    const candidates = await prisma.vendorApplication.findMany({
      where,
      take   : MAX_APPLICATION_PRIORITY_SCAN,
      orderBy: { submittedAt: { sort: "asc", nulls: "last" } }, // FIFO tiebreak within a rank
      select : { id: true, status: true },
    })
    const ranked = candidates
      .map((c, index) => ({ id: c.id, index, rank: APPLICATION_PRIORITY_RANK[c.status] ?? 3 }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .slice(skip, skip + pageSize)

    const rows = ranked.length
      ? await prisma.vendorApplication.findMany({ where: { id: { in: ranked.map((r) => r.id) } }, include: includeShape })
      : []
    const rowById = new Map(rows.map((r) => [r.id, r]))
    const applications = ranked.map((r) => rowById.get(r.id)).filter((r): r is NonNullable<typeof r> => !!r)

    return { applications, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  }

  const orderBy = sortColumn === "submittedAt"
    ? { submittedAt: { sort: sortDir as "asc" | "desc", nulls: "last" as const } }
    : { [sortColumn]: sortDir }

  const [applications, total] = await Promise.all([
    prisma.vendorApplication.findMany({
      where,
      skip,
      take   : pageSize,
      orderBy,
      include: includeShape,
    }),
    prisma.vendorApplication.count({ where }),
  ])

  return { applications, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

const MAX_APPLICATIONS_EXPORT_ROWS = 5000

//* CSV export — same filters/scope as listApplications (buildApplicationsWhere),
//* just unpaginated and bounded, same "give me everything that matches"
//* shape as the compliance/audit exports.
export async function exportApplicationsCsv(filters: ApplicationFilters, adminScope: AdminScopeContext, actorId?: string): Promise<string> {
  const where = await buildApplicationsWhere(filters, adminScope, actorId)
  const rows = await prisma.vendorApplication.findMany({
    where,
    take   : MAX_APPLICATIONS_EXPORT_ROWS,
    orderBy: { submittedAt: { sort: "desc", nulls: "last" } },
    include: {
      country   : { select: { name: true } },
      vendorType: { select: { name: true } },
    },
  })
  return toCsv(rows.map((a) => ({
    legalBusinessName: a.legalBusinessName ?? "",
    businessEmail    : a.businessEmail ?? "",
    country          : a.country?.name ?? "",
    vendorType       : a.vendorType?.name ?? "",
    status           : a.status,
    submittedAt      : a.submittedAt ? a.submittedAt.toISOString().slice(0, 10) : "",
    assignedReviewerId : a.assignedReviewerId ?? "",
    escalatedByAdminId : a.escalatedByAdminId ?? "",
    createdAt        : a.createdAt.toISOString().slice(0, 10),
  })), [
    { key: "legalBusinessName",  label: "Business Name" },
    { key: "businessEmail",      label: "Business Email" },
    { key: "country",            label: "Country" },
    { key: "vendorType",         label: "Category" },
    { key: "status",             label: "Status" },
    { key: "submittedAt",        label: "Submitted" },
    { key: "assignedReviewerId", label: "Assigned Reviewer Id" },
    { key: "escalatedByAdminId", label: "Escalated By Admin Id" },
    { key: "createdAt",          label: "Created" },
  ])
}

//* Get one application

export async function getApplication(applicationId: string, actorScope: AdminScopeContext) {
  const application = await prisma.vendorApplication.findUnique({
    where  : { id: applicationId },
    include: {
      country   : true,
      vendorType: true,
      user      : true,
      documents : {
        where  : { supersededAt: null },
        include: { documentType: true },
        orderBy: { uploadedAt: "desc" },
      },
    },
  })

  if (!application) throw new ApiError(404, "Application not found", "NOT_FOUND")

  // Same rule as listApplications: a DRAFT is the vendor's own unsubmitted
  // work-in-progress, not something admins are allowed to open yet — not
  // even by guessing/reusing an id. Treat it as if it doesn't exist.
  if (application.status === VendorApplicationStatus.DRAFT) {
    throw new ApiError(404, "Application not found", "NOT_FOUND")
  }

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(application.countryId)) {
    throw new ApiError(403, "This application is outside your scope", "SCOPE_FORBIDDEN")
  }

  // assignedReviewerId/escalatedByAdminId are plain ids, not Prisma
  // relations to AdminUser (see the schema comment on VendorApplication) —
  // so the display names the UI needs (Summary card, "assigned to
  // another reviewer" notice) require a small separate lookup rather than
  // an `include`.
  const adminIds = [application.assignedReviewerId, application.escalatedByAdminId].filter((v): v is string => !!v)
  const admins = adminIds.length > 0
    ? await prisma.adminUser.findMany({
        where : { id: { in: adminIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : []
  const nameById = new Map(admins.map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()]))

  return {
    ...application,
    assignedReviewerName: application.assignedReviewerId ? nameById.get(application.assignedReviewerId) ?? null : null,
    escalatedByAdminName: application.escalatedByAdminId ? nameById.get(application.escalatedByAdminId) ?? null : null,
  }
}

//* Mark under review

export async function markUnderReview(
  applicationId   : string,
  actorId         : string,
  actorScope      : AdminScopeContext,
  actorPermissions: AdminPermissionKey[],
) {
  const application = await prisma.vendorApplication.findUnique({
    where: { id: applicationId },
  })
  if (!application) throw new ApiError(404, "Application not found", "NOT_FOUND")

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(application.countryId)) {
    throw new ApiError(403, "Outside your scope", "SCOPE_FORBIDDEN")
  }
  assertReviewerOwnership(application, actorId, actorPermissions)

  if (application.status !== VendorApplicationStatus.SUBMITTED) {
    throw new ApiError(
      400,
      "Only submitted applications can be marked under review",
      "INVALID_STATUS",
    )
  }

  const updated = await prisma.vendorApplication.update({
    where: { id: applicationId },
    data : {
      status      : VendorApplicationStatus.UNDER_REVIEW,
      reviewedAt  : new Date(),
      reviewedById: actorId,
    },
  })

  serviceLog.info({ applicationId, actorId }, "Application marked under review")

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_application.under_review",
    entityType : "VendorApplication",
    entityId   : applicationId,
    changes    : {
      before: { status: "SUBMITTED" },
      after : { status: "UNDER_REVIEW" },
    },
  })

  return updated
}

//* Approve Application

export async function approveApplication(
  applicationId   : string,
  actorId         : string,
  actorScope      : AdminScopeContext,
  actorPermissions: AdminPermissionKey[],
) {
  const application = await prisma.vendorApplication.findUnique({
    where: { id: applicationId },
  })
  if (!application) throw new ApiError(404, "Application not found", "NOT_FOUND")

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(application.countryId)) {
    throw new ApiError(403, "This application is outside your scope", "SCOPE_FORBIDDEN")
  }
  assertReviewerOwnership(application, actorId, actorPermissions)

  if (
    application.status !== VendorApplicationStatus.SUBMITTED &&
    application.status !== VendorApplicationStatus.UNDER_REVIEW
  ) {
    throw new ApiError(
      400,
      `Cannot approve an application with status: ${application.status}`,
      "INVALID_STATUS",
    )
  }

  /*
    *Every required document must be individually APPROVED — not
    *merely uploaded/pending — before the application itself can be
    *approved. This was previously unenforced: an application could
    *be approved with a required document still PENDING or REJECTED.
  */
  await assertAllRequiredDocumentsApproved(application)
  assertApplicationCompleteForApproval(application)

  const [updatedApplication, vendorAccount] = await prisma.$transaction(async (tx) => {
    const app = await tx.vendorApplication.update({
      where: { id: applicationId },
      data : {
        status      : VendorApplicationStatus.APPROVED,
        reviewedAt  : new Date(),
        approvedAt  : new Date(),
        reviewedById: actorId,
      },
    })

    const account = await tx.vendorAccount.create({
      data: {
        applicationId        : applicationId,
        userId               : application.userId,
        vendorTypeId         : application.vendorTypeId,
        otherVendorType      : application.otherVendorType,
        countryId            : application.countryId,
        legalBusinessName    : application.legalBusinessName,
        businessEmail        : application.businessEmail,
        businessPhone        : application.businessPhone ?? "",
        companyRegNumber     : application.registrationNumber,
        taxRegistrationNumber: application.taxId,
        ownerFirstName       : application.ownerFirstName,
        ownerLastName        : application.ownerLastName,
        ownerPhone           : application.ownerPhone,
        ownerEmail           : application.ownerEmail,
        businessAddress      : application.businessAddress,
        addressLine2         : application.addressLine2,
        postalCode           : application.postalCode,
        status               : VendorStatus.ACTIVE,
      },
    })

    // Transfer this application's documents to the new vendor account.
    // Includes PENDING (uploaded but optional/unreviewed) alongside
    // APPROVED — an approval must not silently strand documents the
    // vendor already uploaded just because they weren't required or
    // never got reviewed. REJECTED/EXPIRED/WITHDRAWN/SUPERSEDED are
    // correctly excluded — those are dead ends, not carried forward.
    await tx.vendorDocument.updateMany({
      where: { applicationId, status: { in: [DocumentStatus.APPROVED, DocumentStatus.PENDING] } },
      data : { vendorId: account.id },
    })

    return [app, account]
  })

  serviceLog.info(
    { applicationId, vendorAccountId: vendorAccount.id, actorId },
    "Vendor application approved",
  )

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_application.approved",
    entityType : "VendorApplication",
    entityId   : applicationId,
    changes    : {
      before: { status: application.status },
      after : { status: "APPROVED" },
    },
    metadata: { vendorAccountId: vendorAccount.id },
  })

  return { application: updatedApplication, vendorAccount }
}

//* Reject Application

export async function rejectApplication(
  applicationId   : string,
  reasonCode      : string,
  rejectionReason : string | undefined,
  revisionNotes   : string | undefined,
  actorId         : string,
  actorScope      : AdminScopeContext,
  actorPermissions: AdminPermissionKey[],
) {
  const application = await prisma.vendorApplication.findUnique({
    where: { id: applicationId },
  })
  if (!application) throw new ApiError(404, "Application not found", "NOT_FOUND")

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(application.countryId)) {
    throw new ApiError(403, "This application is outside your scope", "SCOPE_FORBIDDEN")
  }
  assertReviewerOwnership(application, actorId, actorPermissions)

  if (
    application.status !== VendorApplicationStatus.SUBMITTED &&
    application.status !== VendorApplicationStatus.UNDER_REVIEW
  ) {
    throw new ApiError(
      400,
      `Cannot reject an application with status: ${application.status}`,
      "INVALID_STATUS",
    )
  }

  // reasonCode is the mandatory, vendor-facing structured explanation —
  // rejectionReason/revisionNotes remain optional, case-specific free text.
  const reason = await resolveActionReason(reasonCode, application.countryId)

  const updated = await prisma.vendorApplication.update({
    where: { id: applicationId },
    data : {
      status         : VendorApplicationStatus.REJECTED,
      reasonCode     : reason.code,
      rejectionReason: rejectionReason || null,
      revisionNotes  : revisionNotes || null,
      reviewedAt     : new Date(),
      reviewedById   : actorId,
      revisionCount  : { increment: 1 },
    },
  })

  serviceLog.warn({ applicationId, actorId, reasonCode: reason.code }, "Vendor application rejected")

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_application.rejected",
    entityType : "VendorApplication",
    entityId   : applicationId,
    changes    : {
      before: { status: application.status },
      after : { status: "REJECTED", reasonCode: reason.code },
    },
    metadata: { reasonCode: reason.code, reasonLabel: reason.label, rejectionReason, revisionNotes },
  })

  return updated
}


//* Mark application as needing revision — soft, resubmittable, distinct from rejectApplication (terminal)

/*
 * Soft, resubmittable outcome — distinct from rejectApplication
 * (terminal). Deliberately does NOT touch assignedReviewerId/
 * assignedAt — ownership persists through vendor edit -> resubmit,
 * so the same reviewer picks the application back up. See
 * submitApplication (vendor.application.service.ts), which likewise
 * never touches these fields.
 */
export async function markApplicationNeedsRevision(
  applicationId   : string,
  reasonCode      : string,
  rejectionReason : string | undefined,
  revisionNotes   : string | undefined,
  actorId         : string,
  actorScope      : AdminScopeContext,
  actorPermissions: AdminPermissionKey[],
) {
  const application = await prisma.vendorApplication.findUnique({
    where: { id: applicationId },
  })
  if (!application) throw new ApiError(404, "Application not found", "NOT_FOUND")

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(application.countryId)) {
    throw new ApiError(403, "This application is outside your scope", "SCOPE_FORBIDDEN")
  }
  assertReviewerOwnership(application, actorId, actorPermissions)

  if (
    application.status !== VendorApplicationStatus.SUBMITTED &&
    application.status !== VendorApplicationStatus.UNDER_REVIEW
  ) {
    throw new ApiError(
      400,
      `Cannot request revision on an application with status: ${application.status}`,
      "INVALID_STATUS",
    )
  }

  const reason = await resolveActionReason(reasonCode, application.countryId)

  const updated = await prisma.vendorApplication.update({
    where: { id: applicationId },
    data : {
      status         : VendorApplicationStatus.NEEDS_REVISION,
      reasonCode     : reason.code,
      rejectionReason: rejectionReason || null,
      revisionNotes  : revisionNotes || null,
      reviewedAt     : new Date(),
      reviewedById   : actorId,
      revisionCount  : { increment: 1 },
    },
  })

  serviceLog.warn({ applicationId, actorId, reasonCode: reason.code }, "Vendor application marked needs revision")

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_application.needs_revision",
    entityType : "VendorApplication",
    entityId   : applicationId,
    changes    : {
      before: { status: application.status },
      after : { status: "NEEDS_REVISION", reasonCode: reason.code },
    },
    metadata: { reasonCode: reason.code, reasonLabel: reason.label, rejectionReason, revisionNotes },
  })

  return updated
}

//* Claim an application

/*
 * Concurrency safety: the actual guarantee is the conditional
 * updateMany below, not the pre-checks above it. Two concurrent claims
 * both pass the pre-checks (both read before either writes), but only
 * one UPDATE ... WHERE assignedReviewerId IS NULL AND status =
 * SUBMITTED can match — Postgres row-level locking serializes the two
 * statements, and by the time the second one runs, the WHERE clause
 * re-evaluates against the now-current row and matches zero rows. No
 * explicit transaction/locking needed for a single-row conditional
 * update — this is the whole point of doing it this way.
 */
export async function claimApplication(
  applicationId    : string,
  actorId          : string,
  actorScope       : AdminScopeContext,
  actorAvailability: AdminReviewAvailability,
  actorPermissions : AdminPermissionKey[],
) {
  const application = await prisma.vendorApplication.findUnique({
    where : { id: applicationId },
    select: { id: true, status: true, countryId: true, assignedReviewerId: true, escalatedByAdminId: true },
  })
  if (!application) throw new ApiError(404, "Application not found", "NOT_FOUND")
  assertCountryInScope(application.countryId, actorScope)

  if (actorAvailability !== AdminReviewAvailability.AVAILABLE) {
    throw new ApiError(403, "You are unavailable and cannot claim new applications", "REVIEWER_UNAVAILABLE")
  }
  if (application.assignedReviewerId) {
    throw new ApiError(409, "Application is already claimed", "ALREADY_CLAIMED")
  }

  const isOpenEscalation = !!application.escalatedByAdminId
  if (isOpenEscalation) {
    // Open escalation pool — a different eligibility rule than the normal
    // claim path (status doesn't have to be SUBMITTED; it's whatever stage
    // it was escalated from), enforced by the same permanent lock-out and
    // receiver-only gate as every other action on an escalated application.
    assertReviewerOwnership(application, actorId, actorPermissions)
    // Escalated applications stay with the local country team — a
    // globally-scoped RECEIVE_ESCALATION holder still cannot self-claim
    // out of the pool, only reassign into it (same rule and reasoning as
    // claimComplianceCase in admin.vendor.compliance-case.service.ts).
    if (actorScope.isGlobal || !actorScope.countryIds.includes(application.countryId)) {
      throw new ApiError(403, "Escalated applications can only be claimed by country-scoped admins for that country", "GLOBAL_CANNOT_CLAIM_ESCALATION")
    }
  } else if (application.status !== VendorApplicationStatus.SUBMITTED) {
    throw new ApiError(
      400,
      `Only submitted applications can be claimed (current status: ${application.status})`,
      "INVALID_STATUS",
    )
  }

  const assignedAt = new Date()

  const result = await prisma.vendorApplication.updateMany({
    where: { id: applicationId, assignedReviewerId: null, ...(isOpenEscalation ? {} : { status: VendorApplicationStatus.SUBMITTED }) },
    data : { assignedReviewerId: actorId, assignedAt },
  })

  if (result.count === 0) {
    throw new ApiError(409, "Application was claimed by another reviewer just now", "ALREADY_CLAIMED")
  }

  serviceLog.info({ applicationId, actorId }, "Application claimed")
  auditService.log({
    adminUserId: actorId,
    action     : "vendor_application.claimed",
    entityType : "VendorApplication",
    entityId   : applicationId,
    changes    : { after: { assignedReviewerId: actorId } },
  })

  return { id: applicationId, assignedReviewerId: actorId, assignedAt }
}

//* Reassign an application to another eligible reviewer

export async function reassignApplication(
  applicationId: string,
  targetAdminId: string,
  reason       : string | undefined,
  actorId      : string,
  actorScope   : AdminScopeContext,
) {
  const application = await prisma.vendorApplication.findUnique({
    where : { id: applicationId },
    select: { id: true, countryId: true, assignedReviewerId: true, escalatedByAdminId: true },
  })
  if (!application) throw new ApiError(404, "Application not found", "NOT_FOUND")
  assertCountryInScope(application.countryId, actorScope)

  if (targetAdminId === application.assignedReviewerId) {
    throw new ApiError(400, "Application is already assigned to this reviewer", "NO_CHANGE")
  }
  if (targetAdminId === application.escalatedByAdminId) {
    throw new ApiError(400, "Cannot reassign to the admin who escalated this application", "TARGET_IS_ESCALATOR")
  }

  // An unclaimed application that's sitting in the open escalation pool
  // has a narrower eligible-target pool than a normal reassign — only
  // admins who actually receive escalations, otherwise a REASSIGN holder
  // could route it straight back out to an ordinary reviewer and defeat
  // the whole point of escalating it.
  const isOpenEscalationPool = !application.assignedReviewerId && !!application.escalatedByAdminId
  await assertEligibleReviewTarget(
    targetAdminId,
    application.countryId,
    isOpenEscalationPool ? AdminPermissions.VENDORS_APPLICATIONS_RECEIVE_ESCALATION : AdminPermissions.VENDORS_APPLICATIONS_REVIEW,
  )

  const previousReviewerId = application.assignedReviewerId
  const assignedAt = new Date()

  await prisma.vendorApplication.update({
    where: { id: applicationId },
    data : { assignedReviewerId: targetAdminId, assignedAt },
  })

  serviceLog.info({ applicationId, previousReviewerId, targetAdminId, actorId }, "Application reassigned")
  auditService.log({
    adminUserId: actorId,
    action     : "vendor_application.reassigned",
    entityType : "VendorApplication",
    entityId   : applicationId,
    changes    : {
      before: { assignedReviewerId: previousReviewerId },
      after : { assignedReviewerId: targetAdminId },
    },
    metadata: { previousReviewerId, newReviewerId: targetAdminId, reason },
  })

  return { id: applicationId, assignedReviewerId: targetAdminId, assignedAt }
}

//* List admins eligible to receive an application via reassign/escalate —
//* powers the target picker in both dialogs. `capability` distinguishes
//* the two (REVIEW for reassign, RECEIVE_ESCALATION for escalate) since
//* they're deliberately different pools of people.

export async function listEligibleReviewTargets(
  applicationId   : string,
  actorScope      : AdminScopeContext,
  actorId         : string,
  capability      : AdminPermissionKey = AdminPermissions.VENDORS_APPLICATIONS_REVIEW,
) {
  const application = await prisma.vendorApplication.findUnique({
    where : { id: applicationId },
    select: { id: true, countryId: true },
  })
  if (!application) throw new ApiError(404, "Application not found", "NOT_FOUND")
  assertCountryInScope(application.countryId, actorScope)

  // Self is excluded only from the escalation-receiver pool — escalating
  // to yourself is meaningless and already rejected server-side. Reassign
  // deliberately keeps the actor in the list: a REASSIGN holder looking
  // at someone else's claimed application can hand it to themselves
  // without going through the normal claim flow.
  const excludeSelf = capability === AdminPermissions.VENDORS_APPLICATIONS_RECEIVE_ESCALATION

  const candidates = await prisma.adminUser.findMany({
    where: {
      ...(excludeSelf ? { id: { not: actorId } } : {}),
      status            : AdminUserStatus.active,
      reviewAvailability: AdminReviewAvailability.AVAILABLE,
      permissions       : { some: { permission: { key: capability, isActive: true } } },
      scopes: {
        some: {
          OR: [
            { scopeType: AdminScopeType.GLOBAL },
            { scopeType: AdminScopeType.COUNTRY, countryId: application.countryId },
            { scopeType: AdminScopeType.CITY, countryId: application.countryId },
          ],
        },
      },
    },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })

  return candidates
}

/*
 * Guards against escalating an application into a pool nobody can ever
 * pick up — a case that sat unclaimable would just be a silent dead end.
 * Eligibility mirrors the actual claim restriction added to
 * claimApplication above: GLOBAL scope doesn't count, since a global
 * admin can't self-claim out of the pool either (they'd have to
 * reassign it explicitly instead, which doesn't need this check).
 */
async function assertEscalationReceiverExists(countryId: string): Promise<void> {
  const receiver = await prisma.adminUser.findFirst({
    where: {
      status            : AdminUserStatus.active,
      reviewAvailability: AdminReviewAvailability.AVAILABLE,
      permissions       : { some: { permission: { key: AdminPermissions.VENDORS_APPLICATIONS_RECEIVE_ESCALATION, isActive: true } } },
      scopes: {
        some: {
          OR: [
            { scopeType: AdminScopeType.COUNTRY, countryId },
            { scopeType: AdminScopeType.CITY, countryId },
          ],
        },
      },
    },
    select: { id: true },
  })
  if (!receiver) {
    throw new ApiError(
      400,
      "No admin can currently receive escalations for this country — reassign it directly to a specific reviewer instead, or ask a supervisor to grant the receive-escalation permission to someone in this country.",
      "NO_ESCALATION_RECEIVER",
    )
  }
}

//* Escalate an application — hands it to a superior/receiving team and
//* permanently locks the escalating admin out of acting on it again
//* (enforced by assertReviewerOwnership, not by anything here). With no
//* targetAdminId it goes into the open pool: unclaimed, pickable only by
//* an admin holding RECEIVE_ESCALATION (see claimApplication). With a
//* targetAdminId it's assigned directly, same as reassign, but the
//* target must additionally hold RECEIVE_ESCALATION.

export async function escalateApplication(
  applicationId   : string,
  reason          : string,
  actorId         : string,
  actorScope      : AdminScopeContext,
  actorPermissions: AdminPermissionKey[],
  targetAdminId?  : string,
) {
  const application = await prisma.vendorApplication.findUnique({
    where : { id: applicationId },
    select: { id: true, countryId: true, assignedReviewerId: true, status: true, escalatedByAdminId: true },
  })
  if (!application) throw new ApiError(404, "Application not found", "NOT_FOUND")
  assertCountryInScope(application.countryId, actorScope)
  // Only the current assignee (or a REASSIGN holder) may escalate — same
  // ownership rule as every other action, so a random ESCALATE-permitted
  // admin can't hand off someone else's claimed application out from
  // under them.
  assertReviewerOwnership(application, actorId, actorPermissions)

  if (application.escalatedByAdminId) {
    throw new ApiError(409, "Application is already escalated", "ALREADY_ESCALATED")
  }
  const escalatableStatuses: VendorApplicationStatus[] = [
    VendorApplicationStatus.SUBMITTED,
    VendorApplicationStatus.UNDER_REVIEW,
    VendorApplicationStatus.NEEDS_REVISION,
  ]
  if (!escalatableStatuses.includes(application.status)) {
    throw new ApiError(400, `Applications in ${application.status} cannot be escalated`, "INVALID_STATUS")
  }
  if (targetAdminId === actorId) {
    throw new ApiError(400, "Cannot escalate to yourself", "TARGET_IS_SELF")
  }

  if (targetAdminId) {
    await assertEligibleReviewTarget(targetAdminId, application.countryId, AdminPermissions.VENDORS_APPLICATIONS_RECEIVE_ESCALATION)
  } else {
    // No explicit target — it's going into the open pool, so make sure
    // someone in this country can actually pick it up.
    await assertEscalationReceiverExists(application.countryId)
  }

  const escalatedAt = new Date()
  const previousReviewerId = application.assignedReviewerId

  await prisma.vendorApplication.update({
    where: { id: applicationId },
    data : {
      assignedReviewerId: targetAdminId ?? null,
      assignedAt        : targetAdminId ? escalatedAt : null,
      escalatedByAdminId: actorId,
      escalatedAt,
      escalationReason  : reason,
    },
  })

  serviceLog.warn({ applicationId, actorId, targetAdminId, reason }, "Application escalated")
  auditService.log({
    adminUserId: actorId,
    action     : "vendor_application.escalated",
    entityType : "VendorApplication",
    entityId   : applicationId,
    changes    : {
      before: { assignedReviewerId: previousReviewerId },
      after : { assignedReviewerId: targetAdminId ?? null },
    },
    metadata: {
      reason,
      countryId : application.countryId,
      targetAdminId: targetAdminId ?? null,
      openPool  : !targetAdminId,
    },
  })

  return { id: applicationId, escalatedByAdminId: actorId, escalatedAt, assignedReviewerId: targetAdminId ?? null }
}

//* Approve a vendor document

export async function approveDocument(
  documentId: string,
  actorId   : string,
  actorScope: AdminScopeContext,
) {
  const doc = await prisma.vendorDocument.findUnique({
    where  : { id: documentId },
    include: {
      application: { select: { id: true, countryId: true } },
      vendor     : { select: { id: true, countryId: true } },
    },
  })

  if (!doc) throw new ApiError(404, "Document not found", "NOT_FOUND")
  if (doc.status === DocumentStatus.APPROVED) {
    throw new ApiError(400, "Document is already approved", "ALREADY_APPROVED")
  }

  const countryId = doc.application?.countryId ?? doc.vendor?.countryId
  if (!countryId) throw new ApiError(400, "Document has no parent scope", "SCOPE_MISSING")

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(countryId)) {
    throw new ApiError(403, "This document is outside your scope", "SCOPE_FORBIDDEN")
  }

  // 2026-08-26 refinement (CLAUDE.md) — a vendor-account document (not an
  // application-time one) currently tied to an active compliance case can
  // only be reviewed by that case's claimed owner. A no-op if no case
  // exists for this vendor+documentType (e.g. a future non-compliance
  // account-document flow) — see assertVendorDocumentReviewableByActor.
  if (doc.vendorId) {
    await assertVendorDocumentReviewableByActor(doc.vendorId, doc.documentTypeId, actorId)
  }

  const updated = await prisma.vendorDocument.update({
    where: { id: documentId },
    data : {
      status         : DocumentStatus.APPROVED,
      approvedAt     : new Date(),
      reviewedAt     : new Date(),
      rejectionReason: null,
      revisionNotes  : null,
    },
    include: { documentType: true },
  })

  serviceLog.info({ documentId, actorId }, "Vendor document approved")

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_document.approved",
    entityType : "VendorDocument",
    entityId   : documentId,
    changes    : {
      before: { status: doc.status },
      after : { status: DocumentStatus.APPROVED },
    },
  })

  return updated
}

//* Reject a vendor document

export async function rejectDocument(
  documentId     : string,
  rejectionReason: string,
  revisionNotes  : string | undefined,
  actorId        : string,
  actorScope     : AdminScopeContext,
) {
  const doc = await prisma.vendorDocument.findUnique({
    where  : { id: documentId },
    include: {
      application: { select: { id: true, countryId: true } },
      vendor     : { select: { id: true, countryId: true } },
    },
  })

  if (!doc) throw new ApiError(404, "Document not found", "NOT_FOUND")
  if (doc.status === DocumentStatus.REJECTED) {
    throw new ApiError(400, "Document is already rejected", "ALREADY_REJECTED")
  }

  const countryId = doc.application?.countryId ?? doc.vendor?.countryId
  if (!countryId) throw new ApiError(400, "Document has no parent scope", "SCOPE_MISSING")

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(countryId)) {
    throw new ApiError(403, "This document is outside your scope", "SCOPE_FORBIDDEN")
  }

  // 2026-08-26 refinement (CLAUDE.md) — see approveDocument's identical
  // gate above. For a compliance-linked document this is what the admin
  // dashboard frames as "send back for revision" (REJECTED + revisionNotes
  // is already exactly that shape — no rejecting outright, just this).
  if (doc.vendorId) {
    await assertVendorDocumentReviewableByActor(doc.vendorId, doc.documentTypeId, actorId)
  }

  const updated = await prisma.vendorDocument.update({
    where: { id: documentId },
    data : {
      status         : DocumentStatus.REJECTED,
      rejectedAt     : new Date(),
      reviewedAt     : new Date(),
      rejectionReason,
      revisionNotes  : revisionNotes || null,
      approvedAt     : null,
    },
    include: { documentType: true },
  })

  serviceLog.warn({ documentId, actorId, rejectionReason }, "Vendor document rejected")

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_document.rejected",
    entityType : "VendorDocument",
    entityId   : documentId,
    changes    : {
      before: { status: doc.status },
      after : { status: DocumentStatus.REJECTED, rejectionReason },
    },
    metadata: { revisionNotes },
  })

  return updated
}

//* List vendor accounts

const VENDOR_SORT_COLUMNS: Record<string, string> = {
  legalBusinessName: "legalBusinessName",
  status            : "status",
  createdAt         : "createdAt",
}

interface VendorAccountFilters {
  status?      : VendorStatus
  countrySlug? : string
  search?      : string
  vendorTypeId?: string
  bannedOnly?  : boolean
}

//* Shared where-builder — used by both listVendorAccounts and
//* exportVendorAccountsCsv (same "export can never drift from the page"
//* convention as buildApplicationsWhere above).
async function buildVendorAccountsWhere(filters: VendorAccountFilters, adminScope: AdminScopeContext) {
  const { status, countrySlug, search, vendorTypeId, bannedOnly } = filters
  // countrySlug is optional — most admins browse across their entire
  // scope, not one country at a time. Only resolve/narrow when one was
  // actually requested; resolving unconditionally (the previous
  // behavior here) meant an unscoped request silently fell back to
  // Prisma's findFirst() and narrowed every list to a single arbitrary
  // country — the same bug listApplications had and was fixed for.
  const countryId = countrySlug
    ? await getCountryIdFromSlug(countrySlug, adminScope)
    : undefined

  const where: any = {
    deletedAt: null,
    ...buildVendorScopeFilter(adminScope, countryId),
    ...(status ? { status } : {}),
    ...(vendorTypeId ? { vendorTypeId } : {}),
    ...(bannedOnly ? { user: { isBanned: true } } : {}),
    ...(search ? {
      OR: [
        { legalBusinessName: { contains: search, mode: "insensitive" } },
        { businessEmail    : { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  }
  return where
}

export async function listVendorAccounts(
  filters: VendorAccountFilters & { sort?: string; dir?: string; page?: number; pageSize?: number },
  adminScope: AdminScopeContext,
) {
  const { sort, dir, page = 1, pageSize = 20 } = filters
  const sortColumn = VENDOR_SORT_COLUMNS[sort ?? ""] ?? "createdAt"
  const sortDir     = dir === "asc" ? "asc" : "desc"
  const skip = (page - 1) * pageSize

  const where = await buildVendorAccountsWhere(filters, adminScope)

  const [accounts, total] = await Promise.all([
    prisma.vendorAccount.findMany({
      where,
      skip,
      take   : pageSize,
      orderBy: { [sortColumn]: sortDir },
      include: {
        country   : { select: { id: true, name: true, code: true } },
        vendorType: { select: { id: true, name: true } },
        user      : { select: { isBanned: true } },
        _count    : { select: { outlets: true } },
      },
    }),
    prisma.vendorAccount.count({ where }),
  ])

  return { accounts, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

const MAX_VENDOR_ACCOUNTS_EXPORT_ROWS = 5000

export async function exportVendorAccountsCsv(filters: VendorAccountFilters, adminScope: AdminScopeContext): Promise<string> {
  const where = await buildVendorAccountsWhere(filters, adminScope)
  const rows = await prisma.vendorAccount.findMany({
    where,
    take   : MAX_VENDOR_ACCOUNTS_EXPORT_ROWS,
    orderBy: { createdAt: "desc" },
    include: {
      country   : { select: { name: true } },
      vendorType: { select: { name: true } },
      user      : { select: { isBanned: true } },
      _count    : { select: { outlets: true } },
    },
  })
  return toCsv(rows.map((v) => ({
    legalBusinessName: v.legalBusinessName,
    businessEmail    : v.businessEmail,
    country          : v.country?.name ?? "",
    vendorType       : v.vendorType?.name ?? "",
    status           : v.user?.isBanned ? "BANNED" : v.status,
    outletCount      : v._count.outlets,
    // Exported as a human percentage, not raw basis points: a spreadsheet
    // cell reading 1500 for a 15% commission is a support ticket.
    commissionRate   : v.commissionRateBps != null ? `${v.commissionRateBps / 100}%` : "",
    createdAt        : v.createdAt.toISOString().slice(0, 10),
  })), [
    { key: "legalBusinessName", label: "Business Name" },
    { key: "businessEmail",     label: "Business Email" },
    { key: "country",           label: "Country" },
    { key: "vendorType",        label: "Category" },
    { key: "status",            label: "Status" },
    { key: "outletCount",       label: "Outlets" },
    { key: "commissionRate",    label: "Commission Rate" },
    { key: "createdAt",         label: "Joined" },
  ])
}

//* Get one vendor account

export async function getVendorAccount(vendorId: string, actorScope: AdminScopeContext, actorPermissions: AdminPermissionKey[] = []) {
  const account = await prisma.vendorAccount.findUnique({
    where  : { id: vendorId },
    include: {
      country    : true,
      vendorType : true,
      application: true,
      // Banning is identity-level (VendorUser.isBanned) — surfaced here so
      // the detail page can show it correctly (VendorAccount.status alone
      // never reflects a ban, see banVendor/unbanVendor).
      user       : { select: { isBanned: true, banReason: true, bannedAt: true } },
      outlets    : {
        where  : { deletedAt: null },
        select : {
          id          : true,
          name        : true,
          adminStatus : true,
          reviewStatus: true,
          cityId      : true,
          latitude    : true,
          longitude   : true,
          addressLine1: true,
          createdAt   : true,
        },
      },
      documents: {
        where  : { supersededAt: null },
        include: { documentType: { select: { id: true, name: true, expiryWarningDays: true } } },
        orderBy: { uploadedAt: "desc" },
      },
      payoutAccounts: {
        where  : { deletedAt: null },
        include: {
          countryPaymentMethod: {
            include: { paymentMethod: { select: { name: true, type: true, code: true } } },
          },
        },
      },
      vendorProfile: true,
    },
  })

  if (!account || account.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(account.countryId)) {
    throw new ApiError(403, "This vendor is outside your scope", "SCOPE_FORBIDDEN")
  }

  // Outlet.cityId is a plain scalar FK, not a Prisma relation (City has no
  // back-relation to Outlet in schema.prisma) — so the city name can't come
  // through an `include`. Batch-fetch it separately rather than N+1ing.
  const cityIds = [...new Set(account.outlets.map((o) => o.cityId))]
  const cities = cityIds.length
    ? await prisma.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, name: true } })
    : []
  const cityById = new Map(cities.map((c) => [c.id, c]))
  const outlets = account.outlets.map((o) => ({ ...o, city: cityById.get(o.cityId) ?? null }))

  // Compliance visibility is its own permission (VENDORS_COMPLIANCE_READ) —
  // an admin who can read the vendor directory but wasn't granted
  // compliance access gets no `compliance` field at all, not an empty one.
  // Includes MISSING (no document uploaded at all for something required)
  // alongside EXPIRED/EXPIRING_SOON — account.documents alone can't tell
  // you about a document that was never uploaded, which is exactly the
  // blind spot this used to have (see getVendorComplianceIssues).
  const canReadCompliance = actorPermissions.includes(AdminPermissions.VENDORS_COMPLIANCE_READ)
  const [complianceIssues, operationalIssues] = canReadCompliance
    ? await Promise.all([getVendorComplianceIssues(vendorId, actorScope), getVendorOperationalIssues(vendorId, actorScope)])
    : [null, null]
  const compliance = complianceIssues && {
    hasIssues    : complianceIssues.some((i) => i.issueStatus !== "WAIVED") || !!operationalIssues?.hasMissingPayoutAccount,
    missingCount : complianceIssues.filter((i) => i.issueStatus === "MISSING").length,
    expiredCount : complianceIssues.filter((i) => i.issueStatus === "EXPIRED").length,
    expiringCount: complianceIssues.filter((i) => i.issueStatus === "EXPIRING_SOON").length,
    issues       : complianceIssues,
    // Operational (non-document) issue — see admin.vendor.compliance.service.ts's
    // getVendorOperationalIssues for why this isn't folded into `issues`.
    hasMissingPayoutAccount: !!operationalIssues?.hasMissingPayoutAccount,
  }

  // Roadmap VM-P2-02 (CLAUDE.md) — duplicate bank/mobile-money account
  // detection, gated the same way as compliance above: only computed (and
  // only ever shown) for an admin who actually holds payout-management
  // access, not exposed as a side channel to anyone who can merely view
  // the vendor.
  const canManagePayouts = actorPermissions.includes(AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_MANAGE)
  const duplicateFlags = canManagePayouts
    ? await getDuplicatePayoutFlags(vendorId, account.countryId)
    : new Map<string, number>()
  // CLAUDE.md #7 — payout account identifiers are encrypted at rest;
  // presentPayoutAccount() strips the ciphertext and attaches `masked`,
  // the same boundary the vendor-facing endpoints use.
  const payoutAccounts = account.payoutAccounts.map((p) => ({
    ...presentPayoutAccount(p, { includeRiskSignals: canManagePayouts }),
    duplicateElsewhere: duplicateFlags.get(p.id) ?? 0,
  }))

  // Vendor-level selling readiness — the SAME authoritative getVendorGoLiveStatus
  // the vendor dashboard renders, never a re-derivation here. Gated only by the
  // VENDORS_ACCOUNTS_READ this endpoint already requires; the underlying facts
  // (payout / profile / outlet) are all already in this response.
  const goLiveStatus = await getVendorGoLiveStatus(vendorId)

  return { ...account, outlets, compliance, payoutAccounts, goLiveStatus }
}

//* Suspend
// Also deactivates all payout accounts — vendor should not receive payouts while suspended.

export async function suspendVendor(
  vendorId  : string,
  reason    : string,
  actorId   : string,
  actorScope: AdminScopeContext,
) {
  const account = await prisma.vendorAccount.findUnique({ where: { id: vendorId } })
  if (!account || account.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (!actorScope.isGlobal && !actorScope.countryIds.includes(account.countryId)) throw new ApiError(403, "Outside your scope", "SCOPE_FORBIDDEN")
  if (account.status === VendorStatus.SUSPENDED) throw new ApiError(400, "Vendor is already suspended", "ALREADY_SUSPENDED")

  // Count active payout accounts before deactivating — include in audit
  const activePayoutCount = await prisma.vendorPayoutAccount.count({
    where: { vendorId, isActive: true, deletedAt: null },
  })

  await prisma.$transaction([
    prisma.vendorAccount.update({
      where: { id: vendorId },
      data : { status: VendorStatus.SUSPENDED, suspensionReason: reason, suspendedAt: new Date() },
    }),
    // Deactivate all payout accounts — vendor cannot receive payouts while suspended
    prisma.vendorPayoutAccount.updateMany({
      where: { vendorId, deletedAt: null },
      data : { isActive: false, isDefault: false },
    }),
  ])

  serviceLog.warn({ vendorId, actorId, reason }, "Vendor suspended")

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_account.suspended",
    entityType : "VendorAccount",
    entityId   : vendorId,
    changes    : {
      before: { status: account.status },
      after : { status: "SUSPENDED" },
    },
    metadata: { reason, payoutAccountsDeactivated: activePayoutCount },
  })

  return { success: true }
}

/*
  *Reinstate
  *Note: payout accounts remain inactive after reinstatement.
  *The vendor must re-add and re-verify their payout accounts.
  *This is intentional — account details may have changed during suspension.
*/
export async function reinstateVendor(
  vendorId  : string,
  actorId   : string,
  actorScope: AdminScopeContext,
) {
  const account = await prisma.vendorAccount.findUnique({ where: { id: vendorId } })
  if (!account || account.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (!actorScope.isGlobal && !actorScope.countryIds.includes(account.countryId)) throw new ApiError(403, "Outside your scope", "SCOPE_FORBIDDEN")
  if (account.status !== VendorStatus.SUSPENDED) throw new ApiError(400, "Only suspended vendors can be reinstated", "INVALID_STATUS")

  await prisma.vendorAccount.update({
    where: { id: vendorId },
    data : { status: VendorStatus.ACTIVE, suspensionReason: null, suspendedAt: null },
  })

  serviceLog.info({ vendorId, actorId }, "Vendor reinstated")

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_account.reinstated",
    entityType : "VendorAccount",
    entityId   : vendorId,
    changes    : {
      before: { status: "SUSPENDED" },
      after : { status: "ACTIVE" },
    },
    metadata: { note: "Payout accounts remain inactive — vendor must re-add and verify" },
  })

  return { success: true }
}

/*
* Ban 
* Also soft-deletes all payout accounts — permanent, no reinstatement.
* identity-level (VendorUser.isBanned), not
* VendorAccount.status — see schema-changes.md. Signature kept as
* vendorAccountId so the existing route/controller call site
* doesn't need to change; resolved to the linked VendorUser
* internally.
*/

export async function banVendor(
  vendorAccountId: string,
  reason         : string,
  actorId        : string,
  actorScope     : AdminScopeContext,
) {
  const account = await prisma.vendorAccount.findUnique({ where: { id: vendorAccountId } })
  if (!account || account.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (!actorScope.isGlobal && !actorScope.countryIds.includes(account.countryId)) throw new ApiError(403, "Outside your scope", "SCOPE_FORBIDDEN")
  if (!account.userId) throw new ApiError(400, "Vendor account has no linked user", "MISSING_VENDOR_USER")

  const vendorUser = await prisma.vendorUser.findUnique({ where: { id: account.userId } })
  if (!vendorUser) throw new ApiError(404, "Vendor user not found", "VENDOR_USER_NOT_FOUND")
  if (vendorUser.isBanned) throw new ApiError(400, "Vendor is already banned", "ALREADY_BANNED")

  const activePayoutCount = await prisma.vendorPayoutAccount.count({
    where: { vendorId: vendorAccountId, deletedAt: null },
  })

  const now = new Date()

  await prisma.$transaction([
    prisma.vendorUser.update({
      where: { id: vendorUser.id },
      data : { isBanned: true, banReason: reason, bannedAt: now, isActive: false },
    }),
    // Hard soft-delete all payout accounts — vendor is permanently banned
    prisma.vendorPayoutAccount.updateMany({
      where: { vendorId: vendorAccountId, deletedAt: null },
      data : { isActive: false, isDefault: false, deletedAt: now },
    }),
  ])

  /* 
    * Best-effort — the DB-level ban above is the source of truth and
    * has already succeeded. A Clerk hiccup shouldn't roll that back
    * or fail the whole request.
  */
  if (vendorUser.clerkId) {
    try {
      await ClerkVendorStateService.banUser(vendorUser.clerkId)
    } catch (err) {
      serviceLog.error({ err, vendorUserId: vendorUser.id }, "Clerk ban failed — continuing, DB ban already applied")
    }
  }

  serviceLog.warn({ vendorAccountId, vendorUserId: vendorUser.id, actorId, reason }, "Vendor banned")

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_account.banned",
    entityType : "VendorAccount",
    entityId   : vendorAccountId,
    changes    : {
      before: { isBanned: false },
      after : { isBanned: true },
    },
    metadata: { reason, payoutAccountsDeleted: activePayoutCount },
  })

  return { success: true }
}

/*
* Unban — reverses banVendor. Payout accounts are NOT restored (same
* precedent as reinstateVendor after a suspension): they were hard
* soft-deleted, account details may be stale, vendor must re-add and
* re-verify. Best-effort Clerk unban, same treatment as banVendor's ban.
*/

export async function unbanVendor(
  vendorAccountId: string,
  actorId        : string,
  actorScope     : AdminScopeContext,
) {
  const account = await prisma.vendorAccount.findUnique({ where: { id: vendorAccountId } })
  if (!account || account.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (!actorScope.isGlobal && !actorScope.countryIds.includes(account.countryId)) throw new ApiError(403, "Outside your scope", "SCOPE_FORBIDDEN")
  if (!account.userId) throw new ApiError(400, "Vendor account has no linked user", "MISSING_VENDOR_USER")

  const vendorUser = await prisma.vendorUser.findUnique({ where: { id: account.userId } })
  if (!vendorUser) throw new ApiError(404, "Vendor user not found", "VENDOR_USER_NOT_FOUND")
  if (!vendorUser.isBanned) throw new ApiError(400, "Vendor is not banned", "NOT_BANNED")

  await prisma.vendorUser.update({
    where: { id: vendorUser.id },
    data : { isBanned: false, banReason: null, bannedAt: null, isActive: true },
  })

  if (vendorUser.clerkId) {
    try {
      await ClerkVendorStateService.unbanUser(vendorUser.clerkId)
    } catch (err) {
      serviceLog.error({ err, vendorUserId: vendorUser.id }, "Clerk unban failed — continuing, DB unban already applied")
    }
  }

  serviceLog.info({ vendorAccountId, vendorUserId: vendorUser.id, actorId }, "Vendor unbanned")

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_account.unbanned",
    entityType : "VendorAccount",
    entityId   : vendorAccountId,
    changes    : {
      before: { isBanned: true },
      after : { isBanned: false },
    },
    metadata: { note: "Payout accounts remain deactivated — vendor must re-add and verify" },
  })

  return { success: true }
}