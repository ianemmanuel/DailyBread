import { prisma, VendorApplicationStatus, VendorStatus, DocumentStatus  } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "./admin.audit.service"
import type { AdminScopeContext } from "@repo/types/backend"

const serviceLog = logger.child({ module: "vendor-ops-service" })

//* ─── Scope helper ───────────────────────

function buildVendorScopeFilter(scope: AdminScopeContext, requestedCountryId?: string) {
  if (scope.isGlobal) {
    return requestedCountryId ? { countryId: requestedCountryId } : {}
  }
  const allowedCountries = requestedCountryId && scope.countryIds.includes(requestedCountryId)
    ? [requestedCountryId]
    : scope.countryIds
  return { countryId: { in: allowedCountries } }
}

//* ─── List applications ────────────────────

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  submittedAt      : "submittedAt",
  createdAt        : "createdAt",
  legalBusinessName: "legalBusinessName",
}

export async function listApplications(
  filters: {
    status?   : VendorApplicationStatus | VendorApplicationStatus[]
    countryId?: string
    search?   : string
    sort?     : string
    dir?      : string
    page?     : number
    pageSize? : number
  },
  actorScope: AdminScopeContext,
) {
  const { status, countryId, search, page = 1, pageSize = 20 } = filters
  const sortColumn = ALLOWED_SORT_COLUMNS[filters.sort ?? ""] ?? "submittedAt"
  const sortDir    = filters.dir === "asc" ? "asc" : "desc"
  const skip       = (page - 1) * pageSize

  const where: any = {
    ...buildVendorScopeFilter(actorScope, countryId),
    ...(status
      ? Array.isArray(status) ? { status: { in: status } } : { status }
      : {}),
    ...(search ? {
      OR: [
        { legalBusinessName: { contains: search, mode: "insensitive" } },
        { businessEmail    : { contains: search, mode: "insensitive" } },
        { ownerFirstName   : { contains: search, mode: "insensitive" } },
        { ownerLastName    : { contains: search, mode: "insensitive" } },
      ],
    } : {}),
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
      include: {
        country   : { select: { id: true, name: true, code: true } },
        vendorType: { select: { id: true, name: true } },
        user      : { select: { id: true, email: true } },
        _count    : { select: { documents: true } },
      },
    }),
    prisma.vendorApplication.count({ where }),
  ])

  return { applications, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

//* ─── Get one application ──────────────

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

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(application.countryId)) {
    throw new ApiError(403, "This application is outside your scope", "SCOPE_FORBIDDEN")
  }

  return application
}

//* ─── Mark under review ──────────────────
// NOTE: VendorApplication does NOT have a reviewedById column in the schema.
// Do NOT include reviewedById in the update — it will cause Prisma to throw.
// The actorId is recorded in the audit log instead.

export async function markUnderReview(
  applicationId: string,
  actorId      : string,
  actorScope   : AdminScopeContext,
) {
  const application = await prisma.vendorApplication.findUnique({
    where: { id: applicationId },
  })
  if (!application) throw new ApiError(404, "Application not found", "NOT_FOUND")

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(application.countryId)) {
    throw new ApiError(403, "Outside your scope", "SCOPE_FORBIDDEN")
  }

  if (application.status !== VendorApplicationStatus.SUBMITTED) {
    throw new ApiError(
      400,
      "Only submitted applications can be marked under review",
      "INVALID_STATUS",
    )
  }

  const updated = await prisma.vendorApplication.update({
    where: { id: applicationId },
    // reviewedAt exists in schema; reviewedById does NOT — never add it here
    data : {
      status    : VendorApplicationStatus.UNDER_REVIEW,
      reviewedAt: new Date(),
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

//* ─── Approve ────────────────────────

export async function approveApplication(
  applicationId: string,
  actorId      : string,
  actorScope   : AdminScopeContext,
) {
  const application = await prisma.vendorApplication.findUnique({
    where: { id: applicationId },
  })
  if (!application) throw new ApiError(404, "Application not found", "NOT_FOUND")

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(application.countryId)) {
    throw new ApiError(403, "This application is outside your scope", "SCOPE_FORBIDDEN")
  }

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

  const [updatedApplication, vendorAccount] = await prisma.$transaction(async (tx) => {
    const app = await tx.vendorApplication.update({
      where: { id: applicationId },
      data : {
        status    : VendorApplicationStatus.APPROVED,
        reviewedAt: new Date(),
        approvedAt: new Date(),
      },
    })

    const account = await tx.vendorAccount.create({
      data: {
        applicationId       : applicationId,
        userId              : application.userId,
        vendorTypeId        : application.vendorTypeId,
        otherVendorType     : application.otherVendorType,
        countryId           : application.countryId,
        legalBusinessName   : application.legalBusinessName,
        businessEmail       : application.businessEmail,
        businessPhone       : application.businessPhone ?? "",
        companyRegNumber    : application.registrationNumber,
        taxRegistrationNumber: application.taxId,
        ownerFirstName      : application.ownerFirstName,
        ownerLastName       : application.ownerLastName,
        ownerPhone          : application.ownerPhone,
        ownerEmail          : application.ownerEmail,
        businessAddress     : application.businessAddress,
        addressLine2        : application.addressLine2,
        postalCode          : application.postalCode,
        status              : VendorStatus.ACTIVE,
      },
    })

    // Transfer APPROVED documents to the new vendor account
    await tx.vendorDocument.updateMany({
      where: { applicationId, status: "APPROVED" },
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

//* ─── Reject ───────────────────────────

export async function rejectApplication(
  applicationId  : string,
  rejectionReason: string,
  revisionNotes  : string | undefined,
  actorId        : string,
  actorScope     : AdminScopeContext,
) {
  const application = await prisma.vendorApplication.findUnique({
    where: { id: applicationId },
  })
  if (!application) throw new ApiError(404, "Application not found", "NOT_FOUND")

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(application.countryId)) {
    throw new ApiError(403, "This application is outside your scope", "SCOPE_FORBIDDEN")
  }

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

  const updated = await prisma.vendorApplication.update({
    where: { id: applicationId },
    data : {
      status         : VendorApplicationStatus.REJECTED,
      rejectionReason,
      revisionNotes  : revisionNotes || null,
      reviewedAt     : new Date(),
      revisionCount  : { increment: 1 },
    },
  })

  serviceLog.warn({ applicationId, actorId, rejectionReason }, "Vendor application rejected")

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_application.rejected",
    entityType : "VendorApplication",
    entityId   : applicationId,
    changes    : {
      before: { status: application.status },
      after : { status: "REJECTED", rejectionReason },
    },
    metadata: { revisionNotes },
  })

  return updated
}


//* ─── Approve a vendor document ───────────

export async function approveDocument(
  documentId: string,
  actorId   : string,
  actorScope: AdminScopeContext,
) {
  // Fetch doc with its parent application (for scope check + country access)
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

  // Resolve countryId from whichever parent exists
  const countryId = doc.application?.countryId ?? doc.vendor?.countryId
  if (!countryId) throw new ApiError(400, "Document has no parent scope", "SCOPE_MISSING")

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(countryId)) {
    throw new ApiError(403, "This document is outside your scope", "SCOPE_FORBIDDEN")
  }

  const updated = await prisma.vendorDocument.update({
    where: { id: documentId },
    data : {
      status        : DocumentStatus.APPROVED,
      approvedAt    : new Date(),
      reviewedAt    : new Date(),
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

//* ─── Reject a vendor document ─────────────────

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
//* ─── List vendor accounts ─────────────

export async function listVendorAccounts(
  filters: {
    status?   : VendorStatus
    countryId?: string
    search?   : string
    page?     : number
    pageSize? : number
  },
  actorScope: AdminScopeContext,
) {
  const { status, countryId, search, page = 1, pageSize = 20 } = filters
  const skip = (page - 1) * pageSize

  const where: any = {
    deletedAt: null,
    ...buildVendorScopeFilter(actorScope, countryId),
    ...(status ? { status } : {}),
    ...(search ? {
      OR: [
        { legalBusinessName: { contains: search, mode: "insensitive" } },
        { businessEmail    : { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  }

  const [accounts, total] = await Promise.all([
    prisma.vendorAccount.findMany({
      where,
      skip,
      take   : pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        country   : { select: { id: true, name: true, code: true } },
        vendorType: { select: { id: true, name: true } },
        _count    : { select: { outlets: true } },
      },
    }),
    prisma.vendorAccount.count({ where }),
  ])

  return { accounts, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

//* ─── Get one vendor account ───────────────

export async function getVendorAccount(vendorId: string, actorScope: AdminScopeContext) {
  const account = await prisma.vendorAccount.findUnique({
    where  : { id: vendorId },
    include: {
      country    : true,
      vendorType : true,
      application: true,
      outlets    : {
        where  : { deletedAt: null },
        select : {
          id         : true,
          name       : true,
          adminStatus: true,
          cityId     : true,
          city       : { select: { name: true } },
        },
      },
      documents: {
        where  : { supersededAt: null },
        include: { documentType: { select: { id: true, name: true } } },
        orderBy: { uploadedAt: "desc" },
      },
    },
  })

  if (!account || account.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(account.countryId)) {
    throw new ApiError(403, "This vendor is outside your scope", "SCOPE_FORBIDDEN")
  }

  return account
}

//* ─── Suspend ──────────────

export async function suspendVendor(vendorId: string, reason: string, actorId: string, actorScope: AdminScopeContext) {
  const account = await prisma.vendorAccount.findUnique({ where: { id: vendorId } })
  if (!account || account.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (!actorScope.isGlobal && !actorScope.countryIds.includes(account.countryId)) throw new ApiError(403, "Outside your scope", "SCOPE_FORBIDDEN")
  if (account.status === VendorStatus.SUSPENDED) throw new ApiError(400, "Vendor is already suspended", "ALREADY_SUSPENDED")
  if (account.status === VendorStatus.BANNED) throw new ApiError(400, "Cannot suspend a banned vendor", "INVALID_STATUS")

  await prisma.vendorAccount.update({
    where: { id: vendorId },
    data : { status: VendorStatus.SUSPENDED, suspensionReason: reason, suspendedAt: new Date() },
  })

  serviceLog.warn({ vendorId, actorId, reason }, "Vendor suspended")
  auditService.log({ adminUserId: actorId, action: "vendor_account.suspended", entityType: "VendorAccount", entityId: vendorId, changes: { before: { status: account.status }, after: { status: "SUSPENDED" } }, metadata: { reason } })
  return { success: true }
}

//* ─── Reinstate ──────────────────
export async function reinstateVendor(vendorId: string, actorId: string, actorScope: AdminScopeContext) {
  const account = await prisma.vendorAccount.findUnique({ where: { id: vendorId } })
  if (!account || account.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (!actorScope.isGlobal && !actorScope.countryIds.includes(account.countryId)) throw new ApiError(403, "Outside your scope", "SCOPE_FORBIDDEN")
  if (account.status !== VendorStatus.SUSPENDED) throw new ApiError(400, "Only suspended vendors can be reinstated", "INVALID_STATUS")

  await prisma.vendorAccount.update({
    where: { id: vendorId },
    data : { status: VendorStatus.ACTIVE, suspensionReason: null, suspendedAt: null },
  })

  serviceLog.info({ vendorId, actorId }, "Vendor reinstated")
  auditService.log({ adminUserId: actorId, action: "vendor_account.reinstated", entityType: "VendorAccount", entityId: vendorId, changes: { before: { status: "SUSPENDED" }, after: { status: "ACTIVE" } } })
  return { success: true }
}

//* ─── Ban ─────────────────────────

export async function banVendor(vendorId: string, reason: string, actorId: string, actorScope: AdminScopeContext) {
  const account = await prisma.vendorAccount.findUnique({ where: { id: vendorId } })
  if (!account || account.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (!actorScope.isGlobal && !actorScope.countryIds.includes(account.countryId)) throw new ApiError(403, "Outside your scope", "SCOPE_FORBIDDEN")
  if (account.status === VendorStatus.BANNED) throw new ApiError(400, "Vendor is already banned", "ALREADY_BANNED")

  await prisma.vendorAccount.update({
    where: { id: vendorId },
    data : { status: VendorStatus.BANNED, suspensionReason: reason, deactivatedAt: new Date() },
  })

  serviceLog.warn({ vendorId, actorId, reason }, "Vendor banned")
  auditService.log({ adminUserId: actorId, action: "vendor_account.banned", entityType: "VendorAccount", entityId: vendorId, changes: { before: { status: account.status }, after: { status: "BANNED" } }, metadata: { reason } })
  return { success: true }
}