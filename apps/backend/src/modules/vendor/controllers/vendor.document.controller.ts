import { Request, Response, NextFunction } from "express"
import { prisma, VendorApplicationStatus, DocumentStatus } from "@repo/db"
import { getVendorUser } from "@/helpers/auth/vendorAuth"
import { DocumentRequirementService } from "../services/vendor.document.service"
import { R2Service } from "@/lib/r2"
import { ApiError } from "@/middleware/error/error.middleware"
import path from "path"
import { sendSuccess } from "@/helpers/api-response/response"

const ensureEditable = (status: VendorApplicationStatus) => {
  if (
    status !== VendorApplicationStatus.DRAFT &&
    status !== VendorApplicationStatus.REJECTED
  ) {
    throw new ApiError(403, "Documents cannot be modified at this stage", "APPLICATION_LOCKED")
  }
}


//* PRESIGN UPLOAD
export const presignUpload = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorUser(req)
    if (!auth.ok) throw new ApiError(auth.status, auth.message)

    // Accept both "fileType" and "mimeType" so frontend is flexible
    const { fileName, fileType, mimeType, applicationId, documentTypeId } = req.body
    const resolvedType = fileType || mimeType

    if (!fileName || !resolvedType || !applicationId || !documentTypeId) {
      throw new ApiError(400, "Missing required fields")
    }

    const extension = path.extname(fileName).replace(".", "")
    const storageKey = R2Service.generateStorageKey(applicationId, documentTypeId, extension)
    const uploadUrl = await R2Service.generateUploadUrl(storageKey, resolvedType)

    return sendSuccess(res, { uploadUrl, storageKey }, "Upload URL generated")
  } catch (err) {
    next(err)
  }
}


//* UPSERT DOCUMENT
export const upsertDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorUser(req)
    if (!auth.ok) throw new ApiError(auth.status, auth.message)

    const vendorUserId = auth.vendorUser.id
    const {
      applicationId,
      documentTypeId,
      storageKey,
      documentName,
      fileSize,
      mimeType,
      documentNumber,
      issueDate,
      expiryDate,
    } = req.body

    if (!applicationId || !documentTypeId || !storageKey) {
      throw new ApiError(400, "Missing required document fields")
    }

    const application = await prisma.vendorApplication.findUnique({
      where: { id: applicationId },
    })

    if (!application || application.userId !== vendorUserId) {
      throw new ApiError(404, "Application not found")
    }

    ensureEditable(application.status)

    const validation = await DocumentRequirementService.validateDocumentTypeForUpload(
      application,
      documentTypeId
    )
    if (!validation.ok) throw new ApiError(400, validation.message)

    const existingDoc = await prisma.vendorDocument.findFirst({
      where: {
        applicationId,
        documentTypeId,
        supersededAt: null,
        status: { not: DocumentStatus.WITHDRAWN },
      },
    })

    let document
    if (existingDoc) {
      document = await prisma.vendorDocument.update({
        where: { id: existingDoc.id },
        data: {
          storageKey,
          documentName,
          fileSize,
          mimeType,
          documentNumber,
          issueDate,
          expiryDate,
          status: DocumentStatus.PENDING,
          reviewedAt: null,
          approvedAt: null,
          rejectedAt: null,
          rejectionReason: null,
          revisionNotes: null,
        },
      })
    } else {
      document = await prisma.vendorDocument.create({
        data: {
          applicationId,
          documentTypeId,
          storageKey,
          documentName,
          fileSize,
          mimeType,
          documentNumber,
          issueDate,
          expiryDate,
          status: DocumentStatus.PENDING,
        },
      })
    }

    const progress = await DocumentRequirementService.getUploadProgress(application)

    return sendSuccess(
      res,
      { document, progress },
      existingDoc ? "Document replaced successfully" : "Document uploaded successfully",
      existingDoc ? 200 : 201
    )
  } catch (err) {
    next(err)
  }
}


//* GET DOCUMENT REQUIREMENTS
export const getApplicationDocuments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorUser(req)
    if (!auth.ok) throw new ApiError(auth.status, auth.message)

    const { applicationId } = req.params

    const application = await prisma.vendorApplication.findUnique({
      where: { id: applicationId },
    })

    if (!application || application.userId !== auth.vendorUser.id) {
      throw new ApiError(404, "Application not found")
    }

    const requirements = await DocumentRequirementService.getRequirementsWithStatus(application)
    const progress = await DocumentRequirementService.getUploadProgress(application)

    return sendSuccess(
      res,
      {
        application: {
          id: application.id,
          status: application.status,
          countryId: application.countryId,
          vendorTypeId: application.vendorTypeId,
        },
        requirements,
        progress,
      },
      "Document requirements fetched successfully"
    )
  } catch (err) {
    next(err)
  }
}


//* DELETE DOCUMENT
export const deleteDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorUser(req)
    if (!auth.ok) throw new ApiError(auth.status, auth.message)

    const { id } = req.params

    const document = await prisma.vendorDocument.findUnique({
      where: { id },
      include: { application: true },
    })

    if (!document || !document.application) throw new ApiError(404, "Document not found")
    if (document.application.userId !== auth.vendorUser.id) throw new ApiError(403, "Unauthorized")

    ensureEditable(document.application.status)

    await R2Service.deleteObject(document.storageKey)
    await prisma.vendorDocument.delete({ where: { id } })

    const progress = await DocumentRequirementService.getUploadProgress(document.application)

    return sendSuccess(res, { progress }, "Document deleted successfully")
  } catch (err) {
    next(err)
  }
}


//* PREVIEW DOCUMENT (get signed view URL)
export const previewDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorUser(req)
    if (!auth.ok) throw new ApiError(auth.status, auth.message)

    const { id } = req.params

    const document = await prisma.vendorDocument.findUnique({
      where: { id },
      include: { application: true },
    })

    if (!document || !document.application) throw new ApiError(404, "Document not found")
    if (document.application.userId !== auth.vendorUser.id) throw new ApiError(403, "Unauthorized")

    const signedUrl = await R2Service.generateViewUrl(document.storageKey)

    return sendSuccess(res, { url: signedUrl }, "Preview URL generated")
  } catch (err) {
    next(err)
  }
}