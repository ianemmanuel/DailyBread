import { Request, Response, NextFunction } from "express"
import { prisma, VendorApplicationStatus, DocumentStatus } from "@repo/db"
import { getVendorUser } from "@/helpers/auth/vendorAuth"
import { ClerkVendorStateService } from "@/lib/clerk"
import { DocumentRequirementService } from "../services/vendor.document.service"
import { R2Service } from "@/lib/r2"
import { ApiError } from "@/middleware/error"
import { sendError, sendSuccess } from "@/helpers/api-response/response"


//* GET vendor Application
export const getApplication = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorUser(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const application = await prisma.vendorApplication.findFirst({
      where: { userId: auth.vendorUser.id },
      include: {
        country: true,
        vendorType: true,
        documents: {
          where: { status: { not: "WITHDRAWN" } },
          orderBy: { createdAt: "desc" },
        },
      },
    })

    if (!application) throw new ApiError(404, "No application found")

    return sendSuccess(res, application, "Application fetched successfully")
  } catch (err) {
    next(err)
  }
}


//* CREATE or UPDATE vendor application
export const upsertApplication = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorUser(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const userId = auth.vendorUser.id!
    const clerkUserId = auth.vendorUser.clerkId!

    const {
      countryId,
      vendorTypeId,
      otherVendorType,
      legalBusinessName,
      registrationNumber,
      taxId,
      businessEmail,
      businessPhone,
      ownerFirstName,
      ownerLastName,
      ownerPhone,
      ownerEmail,
      businessAddress,
      addressLine2,
      postalCode,
    } = req.body

    if (!countryId || !vendorTypeId || !legalBusinessName || !businessEmail || !ownerFirstName || !ownerLastName || !businessAddress) {
      throw new ApiError(400, "Please fill in all required fields")
    }

    const existing = await prisma.vendorApplication.findUnique({ where: { userId } })

    // ── CREATE ────────────────────────────────────────────────────────────────
    if (!existing) {
      const application = await prisma.vendorApplication.create({
        data: {
          userId,
          countryId,
          vendorTypeId,
          otherVendorType,
          legalBusinessName,
          registrationNumber,
          taxId,
          businessEmail,
          businessPhone,
          ownerFirstName,
          ownerLastName,
          ownerPhone,
          ownerEmail,
          businessAddress,
          addressLine2,
          postalCode,
          status: VendorApplicationStatus.DRAFT,
        },
      })

      await ClerkVendorStateService.setVendorApplicationStatus(clerkUserId, VendorApplicationStatus.DRAFT)

      return sendSuccess(res, application, "Application created", 201)
    }

    // ── GUARD: only DRAFT and REJECTED can be edited ──────────────────────────
    if (
      existing.status !== VendorApplicationStatus.DRAFT &&
      existing.status !== VendorApplicationStatus.REJECTED
    ) {
      throw new ApiError(403, "Your application cannot be edited at this stage")
    }

    // ── CLEANUP: delete documents if country or vendorType changed ────────────
    // Documents are scoped to country + vendorType so they become invalid on change
    const countryChanged = existing.countryId !== countryId
    const vendorTypeChanged = existing.vendorTypeId !== vendorTypeId

    if (countryChanged || vendorTypeChanged) {
      const docsToDelete = await prisma.vendorDocument.findMany({
        where: {
          applicationId: existing.id,
          status: { not: DocumentStatus.WITHDRAWN },
        },
      })

      // Delete from R2 storage — fire in parallel, don't fail if one misses
      await Promise.allSettled(
        docsToDelete.map(doc => R2Service.deleteObject(doc.storageKey))
      )

      // Delete all document records for this application
      await prisma.vendorDocument.deleteMany({
        where: { applicationId: existing.id },
      })
    }

    // ── UPDATE ────────────────────────────────────────────────────────────────
    const updated = await prisma.vendorApplication.update({
      where: { id: existing.id },
      data: {
        countryId,
        vendorTypeId,
        otherVendorType,
        legalBusinessName,
        registrationNumber,
        taxId,
        businessEmail,
        businessPhone,
        ownerFirstName,
        ownerLastName,
        ownerPhone,
        ownerEmail,
        businessAddress,
        addressLine2,
        postalCode,
        // Move REJECTED back to DRAFT when user resubmits edits
        status: existing.status === VendorApplicationStatus.REJECTED
          ? VendorApplicationStatus.DRAFT
          : existing.status,
        // Clear review fields on edit
        rejectionReason: null,
        revisionNotes: null,
        reviewedAt: null,
        reviewedBy: null,
      },
    })

    await ClerkVendorStateService.setVendorApplicationStatus(clerkUserId, VendorApplicationStatus.DRAFT)

    return sendSuccess(
      res,
      updated,
      existing.status === VendorApplicationStatus.REJECTED
        ? "Application revised successfully"
        : "Application updated successfully"
    )
  } catch (err) {
    next(err)
  }
}


//* PREVIEW vendor application (used by review page)
export const previewApplication = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorUser(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const vendorUserId = auth.vendorUser.id
    const { id } = req.params

    const application = await prisma.vendorApplication.findUnique({
      where: { id },
      include: {
        country: true,
        vendorType: true,
        documents: {
          where: { supersededAt: null, status: { not: DocumentStatus.WITHDRAWN } },
          include: { documentType: true },
        },
      },
    })

    if (!application || application.userId !== vendorUserId) {
      throw new ApiError(404, "Application not found")
    }

    const requirements = await DocumentRequirementService.getRequirementsWithStatus(application)
    const progress = await DocumentRequirementService.getUploadProgress(application)
    const missingRequired = requirements.filter(r => r.isRequired && !r.uploaded).map(r => r.documentTypeId)
    const canSubmit =
      progress.percentage === 100 &&
      (application.status === VendorApplicationStatus.DRAFT ||
        application.status === VendorApplicationStatus.REJECTED)

    return sendSuccess(
      res,
      { application, requirements, progress, missingRequired, canSubmit },
      "Preview fetched successfully"
    )
  } catch (err) {
    next(err)
  }
}

 
//* SUBMIT vendor application
export const submitApplication = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorUser(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const vendorUserId = auth.vendorUser.id
    const { id } = req.params

    const application = await prisma.vendorApplication.findUnique({ where: { id } })

    if (!application || application.userId !== vendorUserId) {
      throw new ApiError(404, "Application not found")
    }

    if (
      application.status !== VendorApplicationStatus.DRAFT &&
      application.status !== VendorApplicationStatus.REJECTED
    ) {
      throw new ApiError(403, "This application has already been submitted")
    }

    const progress = await DocumentRequirementService.getUploadProgress(application)

    if (progress.percentage < 100) {
      return sendError(res, 400, "Please upload all required documents before submitting")
    }

    const updatedApplication = await prisma.vendorApplication.update({
      where: { id },
      data: {
        status: VendorApplicationStatus.SUBMITTED,
        submittedAt: new Date(),
        revisionCount: { increment: 1 },
      },
    })

    await ClerkVendorStateService.setVendorApplicationStatus(
      auth.vendorUser.clerkId!,
      VendorApplicationStatus.SUBMITTED
    )

    return sendSuccess(
      res,
      { id: updatedApplication.id, status: updatedApplication.status },
      "Application submitted successfully"
    )
  } catch (err) {
    next(err)
  }
}