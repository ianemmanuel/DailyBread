import { prisma, VendorApplicationStatus, VendorStatus } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "./admin.audit.service"
import type { AdminScopeContext } from "@repo/types/backend"

const serviceLog = logger.child({ module: "vendor-ops-service" })

//* ─── List applications ─────────────────────────

export async function listApplications(
  filters: {
    status?     : VendorApplicationStatus | VendorApplicationStatus[]
    countryId?  : string
    search?     : string
    page?       : number
    pageSize?   : number
  },
  actorScope: AdminScopeContext,
) {
  const { status, countryId, search, page = 1, pageSize = 20 } = filters
  const skip = (page - 1) * pageSize

  const where: any = {
    // Scope filter: country-scoped admins only see applications for their countries
    ...buildVendorScopeFilter(actorScope, countryId),
    ...(status
      ? Array.isArray(status)
        ? { status: { in: status } }
        : { status }
      : {}),
    ...(search
      ? {
          OR: [
            { legalBusinessName: { contains: search, mode: "insensitive" } },
            { businessEmail:     { contains: search, mode: "insensitive" } },
            { ownerFirstName:    { contains: search, mode: "insensitive" } },
            { ownerLastName:     { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  }

  const [applications, total] = await Promise.all([
    prisma.vendorApplication.findMany({
      where,
      skip,
      take   : pageSize,
      orderBy: { submittedAt: { sort: "desc", nulls: "last" } },
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

//* ─── Get one application ───────────────────

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

  //* Scope guard
  if (!actorScope.isGlobal && !actorScope.countryIds.includes(application.countryId)) {
    throw new ApiError(403, "This application is outside your scope", "SCOPE_FORBIDDEN")
  }

  return application
}

//* ─── Approve application ──────────────────────────────────────────────────────

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

  if (application.status !== VendorApplicationStatus.SUBMITTED &&
      application.status !== VendorApplicationStatus.UNDER_REVIEW) {
    throw new ApiError(400, `Cannot approve an application with status: ${application.status}`, "INVALID_STATUS")
  }

  //* Move to UNDER_REVIEW → APPROVED and create VendorAccount in a transaction
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

    //* Create the VendorAccount from the application data
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

//* ─── Reject application ───────────────────────────────────────────────────────

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

  if (application.status !== VendorApplicationStatus.SUBMITTED &&
      application.status !== VendorApplicationStatus.UNDER_REVIEW) {
    throw new ApiError(400, `Cannot reject an application with status: ${application.status}`, "INVALID_STATUS")
  }

  const updated = await prisma.vendorApplication.update({
    where: { id: applicationId },
    data : {
      status         : VendorApplicationStatus.REJECTED,
      rejectionReason,
      revisionNotes  : revisionNotes ?? null,
      reviewedAt     : new Date(),
      reviewedById   : actorId,
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

//* ─── Set to under review ──────────────────────────────────

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
    throw new ApiError(400, "Only submitted applications can be marked under review", "INVALID_STATUS")
  }

  const updated = await prisma.vendorApplication.update({
    where: { id: applicationId },
    data : { status: VendorApplicationStatus.UNDER_REVIEW, reviewedById: actorId },
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

// ─── List vendor accounts ────────────────────────────────────

export async function listVendorAccounts(
  filters: {
    status?    : VendorStatus
    countryId? : string
    search?    : string
    page?      : number
    pageSize?  : number
  },
  actorScope: AdminScopeContext,
) {
  const { status, countryId, search, page = 1, pageSize = 20 } = filters
  const skip = (page - 1) * pageSize

  const where: any = {
    deletedAt: null,
    ...buildVendorScopeFilter(actorScope, countryId),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { legalBusinessName: { contains: search, mode: "insensitive" } },
            { businessEmail:     { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
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

// ─── Get one vendor account ───────────────────────────────────────────────────

export async function getVendorAccount(vendorId: string, actorScope: AdminScopeContext) {
  const account = await prisma.vendorAccount.findUnique({
    where  : { id: vendorId },
    include: {
      country    : true,
      vendorType : true,
      application: true,
      outlets    : {
        where  : { deletedAt: null },
        select : { id: true, name: true, adminStatus: true, cityId: true },
      },
      documents: {
        where  : { supersededAt: null },
        include: { documentType: { select: { id: true, name: true } } },
      },
    },
  })

  if (!account || account.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(account.countryId)) {
    throw new ApiError(403, "This vendor is outside your scope", "SCOPE_FORBIDDEN")
  }

  return account
}

// ─── Suspend vendor ───────────────────────────────────────────────────────────

export async function suspendVendor(
  vendorId : string,
  reason   : string,
  actorId  : string,
  actorScope: AdminScopeContext,
) {
  const account = await prisma.vendorAccount.findUnique({ where: { id: vendorId } })
  if (!account || account.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(account.countryId)) {
    throw new ApiError(403, "Outside your scope", "SCOPE_FORBIDDEN")
  }

  if (account.status === VendorStatus.SUSPENDED) {
    throw new ApiError(400, "Vendor is already suspended", "ALREADY_SUSPENDED")
  }
  if (account.status === VendorStatus.BANNED) {
    throw new ApiError(400, "Cannot suspend a banned vendor", "INVALID_STATUS")
  }

  await prisma.vendorAccount.update({
    where: { id: vendorId },
    data : {
      status          : VendorStatus.SUSPENDED,
      suspensionReason: reason,
      suspendedAt     : new Date(),
    },
  })

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
    metadata: { reason },
  })

  return { success: true }
}

// ─── Reinstate vendor ─────────────────────────────────────────────────────────

export async function reinstateVendor(
  vendorId : string,
  actorId  : string,
  actorScope: AdminScopeContext,
) {
  const account = await prisma.vendorAccount.findUnique({ where: { id: vendorId } })
  if (!account || account.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(account.countryId)) {
    throw new ApiError(403, "Outside your scope", "SCOPE_FORBIDDEN")
  }

  if (account.status !== VendorStatus.SUSPENDED) {
    throw new ApiError(400, "Only suspended vendors can be reinstated", "INVALID_STATUS")
  }

  await prisma.vendorAccount.update({
    where: { id: vendorId },
    data : {
      status          : VendorStatus.ACTIVE,
      suspensionReason: null,
      suspendedAt     : null,
    },
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
  })

  return { success: true }
}

// ─── Ban vendor ───────────────────────────────────────────────────────────────

export async function banVendor(
  vendorId : string,
  reason   : string,
  actorId  : string,
  actorScope: AdminScopeContext,
) {
  const account = await prisma.vendorAccount.findUnique({ where: { id: vendorId } })
  if (!account || account.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")

  if (!actorScope.isGlobal && !actorScope.countryIds.includes(account.countryId)) {
    throw new ApiError(403, "Outside your scope", "SCOPE_FORBIDDEN")
  }

  if (account.status === VendorStatus.BANNED) {
    throw new ApiError(400, "Vendor is already banned", "ALREADY_BANNED")
  }

  await prisma.vendorAccount.update({
    where: { id: vendorId },
    data : {
      status          : VendorStatus.BANNED,
      suspensionReason: reason,
      deactivatedAt   : new Date(),
    },
  })

  serviceLog.warn({ vendorId, actorId, reason }, "Vendor banned")

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_account.banned",
    entityType : "VendorAccount",
    entityId   : vendorId,
    changes    : {
      before: { status: account.status },
      after : { status: "BANNED" },
    },
    metadata: { reason },
  })

  return { success: true }
}

// ─── Scope helper ─────────────────────────────────────────────────────────────

function buildVendorScopeFilter(actorScope: AdminScopeContext, requestedCountryId?: string) {
  if (actorScope.isGlobal) {
    return requestedCountryId ? { countryId: requestedCountryId } : {}
  }
  // Country-scoped admin: intersect their countries with any requested filter
  const allowedCountries = requestedCountryId && actorScope.countryIds.includes(requestedCountryId)
    ? [requestedCountryId]
    : actorScope.countryIds

  return { countryId: { in: allowedCountries } }
}