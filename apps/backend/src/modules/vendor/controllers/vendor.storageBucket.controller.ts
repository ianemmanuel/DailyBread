import { Request, Response, NextFunction } from "express"
import { prisma, VendorApplicationStatus } from "@repo/db"
import { getVendorUser } from "@/helpers/auth/vendorAuth"
import { DocumentRequirementService } from "../services/vendor.document.service"
import { R2Service } from "@/lib/r2"
import path from "path"
import { sendSuccess, sendError } from "@/helpers/api-response/response"

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]


export const generateFileUploadUrl = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const auth = await getVendorUser(req)
    if (!auth.ok) {
      return sendError(res, auth.status, auth.message)
    }

    const { applicationId, documentTypeId, fileName, mimeType } = req.body

    if (!applicationId || !documentTypeId || !fileName || !mimeType) {
      return sendError(res, 400, "Missing required fields")
    }

    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return sendError(res, 400, "Unsupported file type")
    }

    const application = await prisma.vendorApplication.findUnique({
      where: { id: applicationId },
    })

    if (!application || application.userId !== auth.vendorUser.id) {
      return sendError(res, 404, "Application not found")
    }

    if (
      application.status !== VendorApplicationStatus.DRAFT &&
      application.status !== VendorApplicationStatus.REJECTED
    ) {
      return sendError(res, 403, "Cannot upload documents at this stage")
    }

    const validation =
      await DocumentRequirementService.validateDocumentTypeForUpload(
        application,
        documentTypeId
      )

    if (!validation.ok) {
      return sendError(res, 400, validation.message)
    }

    const extension = path.extname(fileName).replace(".", "")

    const storageKey = R2Service.generateStorageKey(
      applicationId,
      documentTypeId,
      extension
    )

    const uploadUrl = await R2Service.generateUploadUrl(
      storageKey,
      mimeType
    )

    return sendSuccess(res, { uploadUrl, storageKey })
  } catch (err) {
    next(err)
  }
}

export const getFileViewUrl = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const auth = await getVendorUser(req)
    if (!auth.ok) {
      return sendError(res, auth.status, auth.message)
    }

    const { id } = req.params

    const document = await prisma.vendorDocument.findUnique({
      where: { id },
      include: { application: true },
    })

    if (!document || !document.application) {
      return sendError(res, 404, "Document not found")
    }

    if (document.application.userId !== auth.vendorUser.id) {
      return sendError(res, 403, "Unauthorized")
    }

    const url = await R2Service.generateViewUrl(document.storageKey)

    return sendSuccess(res, { url })
  } catch (err) {
    next(err)
  }
}