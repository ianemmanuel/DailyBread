import { Request, Response, NextFunction } from "express"
import { getVendorAccount } from "@/helpers/auth/vendorAuth"
import { ApiError } from "@/middleware/error"
import { sendSuccess } from "@/helpers/api-response/response"
import { prisma } from "@repo/db"

// ─── GET /api/vendors/v1/auth/session ─────────────────────────────────────────
// Called once when the vendor logs in via Clerk.
// Returns everything the dashboard needs to bootstrap:
//   - vendor user identity
//   - vendor account status and details
//   - outlet summary (count, whether any exist)
//   - payout account status (whether at least one verified account exists)
//   - application status (for vendors still in onboarding)
//
// The frontend uses this to decide which screens to show and which
// persistent banners to display (e.g. "Add a payout account").

export const getVendorSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)

    // Vendor has a user but no approved account yet — still in onboarding
    if (!auth.ok) {
      // Check if they at least have an application so we can guide them
      if (!req.auth) return next(new ApiError(401, "Unauthorized"))

      const vendorUser = await prisma.vendorUser.findUnique({
        where: { clerkId: req.auth.clerkUserId },
      })

      if (!vendorUser) return next(new ApiError(404, "Vendor user not found"))

      const application = await prisma.vendorApplication.findFirst({
        where : { userId: vendorUser.id },
        select: {
          id            : true,
          status        : true,
          submittedAt   : true,
          rejectionReason: true,
          revisionNotes : true,
        },
      })

      return sendSuccess(res, {
        stage      : "ONBOARDING" as const,
        vendorUser : {
          id      : vendorUser.id,
          email   : vendorUser.email,
          isActive: vendorUser.isActive,
        },
        application: application ?? null,
      }, "Session fetched")
    }

    const { vendorUser, vendorAccount } = auth

    // Batch-fetch all dashboard-relevant data in parallel
    const [outletSummary, payoutSummary] = await Promise.all([
      prisma.outlet.aggregate({
        where: { vendorId: vendorAccount.id, deletedAt: null },
        _count: { id: true },
      }),
      prisma.vendorPayoutAccount.findFirst({
        where : { vendorId: vendorAccount.id, isActive: true, deletedAt: null, verificationStatus: "VERIFIED" },
        select: { id: true },
      }),
    ])

    const outletCount = outletSummary._count.id
    const hasVerifiedPayoutAccount = payoutSummary !== null

    return sendSuccess(res, {
      stage      : "ACTIVE" as const,
      vendorUser : {
        id      : vendorUser.id,
        email   : vendorUser.email,
        isActive: vendorUser.isActive,
      },
      vendorAccount: {
        id               : vendorAccount.id,
        status           : vendorAccount.status,
        legalBusinessName: vendorAccount.legalBusinessName,
        businessEmail    : vendorAccount.businessEmail,
        countryId        : vendorAccount.countryId,
        vendorTypeId     : vendorAccount.vendorTypeId,
        payoutSchedule   : vendorAccount.payoutSchedule,
        // Onboarding checklist flags — frontend uses these for persistent banners
        onboarding: {
          hasOutlet           : outletCount > 0,
          hasVerifiedPayout   : hasVerifiedPayoutAccount,
          // True only when both are done — banner clears when checklist is complete
          isComplete          : outletCount > 0 && hasVerifiedPayoutAccount,
        },
      },
    }, "Session fetched")
  } catch (err) {
    next(err)
  }
}