import { Request, Response, NextFunction } from "express"
import { prisma, VendorApplicationStatus } from "@repo/db"
import type {
  AuthenticatedVendorRequest,
  VendorRequest,
  VendorLifecycleState,
  VendorSessionApplication,
  VendorSessionAccount,
} from "@repo/types/backend"
import type {
  VendorApplicationStatus as DomainApplicationStatus,
  VendorStatus as DomainAccountStatus,
} from "@repo/types/enums"

import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"
import { logger } from "@/lib/pino/logger"

const authLog = logger.child({ module: "auth:vendor" })

// VendorSessionApplication/VendorSessionAccount/VendorSessionData are the
// wire contract shared with frontend apps via @repo/types — dates are
// ISO strings there, never Date objects. Prisma returns Date, so every
// date field crossing into req.vendor must be serialized here.
const toIso = (date: Date | null): string | null => (date ? date.toISOString() : null)

function deriveState(
  application: { status: DomainApplicationStatus } | null,
  account    : { status: DomainAccountStatus } | null,
): VendorLifecycleState {
  if (account) {
    if (account.status === "SUSPENDED") return "SUSPENDED"
    return "ACTIVE"
  }

  if (!application) return "NOT_STARTED"

  switch (application.status) {
    case "DRAFT"          : return "DRAFT"
    case "SUBMITTED"      :
    case "UNDER_REVIEW"   : return "PENDING_REVIEW"
    case "NEEDS_REVISION" : return "NEEDS_REVISION"
    case "REJECTED"       : return "REJECTED"
    default:
      // APPROVED with no account row — shouldn't happen, approveApplication
      // creates both atomically. Logged by the caller below.
      return "PENDING_REVIEW"
  }
}

/*
 * STEP 2 of the vendor authorization chain.
 *
 * Order of checks, each short-circuiting the ones below it:
 *   1. isDeleted / isActive — identity-level gates
 *   2. isBanned — checked BEFORE touching account/application at all.
 *      Ban is an identity-level fact, independent of what stage the
 *      vendor was at when it happened (mid-application or post-approval).
 *   3. Only past all of that: the staged account→application query.
 *
 * Staging, not one flattened query:
 *   Stage 1 — VendorUser + vendorAccount ONLY. For an approved,
 *     operating vendor (the traffic majority once mature), this is
 *     the ONLY query this middleware ever runs.
 *   Stage 2 — VendorApplication, only reached when Stage 1 found no
 *     account, i.e. the vendor is still somewhere in onboarding.
 *
 * Does NOT load dashboard data (outlet counts, payout verification)
 * — that's business-endpoint-specific, not universal request context.
 */
export async function loadVendorContext(req: Request, _res: Response, next: NextFunction) {
  const { vendorClerkUserId } = req as AuthenticatedVendorRequest

  if (!vendorClerkUserId) {
    return next(new ApiError(HttpStatus.UNAUTHORIZED, "Unauthorized", "MISSING_CLERK_ID"))
  }

  // Stage 1
  const vendorUser = await prisma.vendorUser.findUnique({
    where : { externalAuthId: vendorClerkUserId },
    select: {
      id       : true,
      email    : true,
      isActive : true,
      isDeleted: true,
      isBanned : true,
      banReason: true,
      bannedAt : true,
      vendorAccount: {
        where : { deletedAt: null },
        select: {
          id               : true,
          status           : true,
          countryId        : true,
          vendorTypeId     : true,
          legalBusinessName: true,
          suspensionReason : true,
          suspendedAt      : true,
          suspensionUntil  : true,
        },
      },
    },
  })

  if (!vendorUser) {
    return next(new ApiError(HttpStatus.UNAUTHORIZED, "Unauthorized", "VENDOR_USER_NOT_FOUND"))
  }

  if (vendorUser.isDeleted) {
    authLog.warn({ vendorUserId: vendorUser.id }, "Blocked request — vendor user deleted")
    return next(new ApiError(HttpStatus.FORBIDDEN, "This account no longer exists.", "VENDOR_DELETED"))
  }

  if (!vendorUser.isActive) {
    authLog.warn({ vendorUserId: vendorUser.id }, "Blocked request — vendor user inactive")
    return next(new ApiError(HttpStatus.FORBIDDEN, "This account has been deactivated.", "VENDOR_INACTIVE"))
  }

  //* Prisma's generated enums and @repo/types' hand-declared enums
  //* are nominally distinct types even with identical string values
  //* — TS enums aren't structurally compatible across separate
  //* declarations. Cast at this exact boundary (Prisma layer →
  //* domain-contract layer), not scattered elsewhere.
  const domainUser = {
    id       : vendorUser.id,
    email    : vendorUser.email,
    isActive : vendorUser.isActive,
    isBanned : vendorUser.isBanned,
    banReason: vendorUser.banReason,
    bannedAt : toIso(vendorUser.bannedAt),
  }

  if (vendorUser.isBanned) {
    authLog.warn({ vendorUserId: vendorUser.id }, "Blocked request — vendor banned")

    ;(req as Partial<VendorRequest>).vendor = {
      user       : domainUser,
      application: null,
      account    : null,
      state      : "BANNED",
    }

    return next()
  }

  const account: VendorSessionAccount | null = vendorUser.vendorAccount
    ? {
        ...vendorUser.vendorAccount,
        status         : vendorUser.vendorAccount.status as unknown as DomainAccountStatus,
        suspendedAt    : toIso(vendorUser.vendorAccount.suspendedAt),
        suspensionUntil: toIso(vendorUser.vendorAccount.suspensionUntil),
      }
    : null

  // Stage 2 — only when no account exists yet
  let application: VendorSessionApplication | null = null

  if (!account) {
    // Queried directly against VendorApplication by userId — not via
    // a VendorUser relation traversal — so this doesn't depend on
    // the `applications` → `application` relation rename.
    const rawApplication = await prisma.vendorApplication.findUnique({
      where : { userId: vendorUser.id },
      select: {
        id             : true,
        status         : true,
        countryId      : true,
        vendorTypeId   : true,
        submittedAt    : true,
        reviewedAt     : true,
        approvedAt     : true,
        rejectionReason: true,
        revisionNotes  : true,
        reasonCode     : true,
      },
    })

    if (rawApplication) {
      application = {
        ...rawApplication,
        status     : rawApplication.status as unknown as DomainApplicationStatus,
        submittedAt: toIso(rawApplication.submittedAt),
        reviewedAt : toIso(rawApplication.reviewedAt),
        approvedAt : toIso(rawApplication.approvedAt),
      }

      if (rawApplication.status === VendorApplicationStatus.APPROVED) {
        authLog.error(
          { vendorUserId: vendorUser.id, applicationId: rawApplication.id },
          "Application is APPROVED but no VendorAccount exists — data inconsistency",
        )
      }
    }
  }

  ;(req as Partial<VendorRequest>).vendor = {
    user: domainUser,
    application,
    account,
    state: deriveState(application, account),
  }

  next()
}