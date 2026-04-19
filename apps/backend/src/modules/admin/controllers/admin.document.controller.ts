import { RequestHandler }    from "express"
import { prisma }            from "@repo/db"
import type { AdminRequest } from "@repo/types/backend"
import { R2Service }         from "@/lib/r2/r2.service"
import { sendSuccess }       from "@/helpers/api-response/response"
import { ApiError }          from "@/middleware/error"
import { logger }            from "@/lib/pino/logger"

const docLog = logger.child({ module: "admin:vendor-document" })

/**
 * GET /api/admin/v1/vendors/documents/:id/signed-url
 *
 * Generates a short-lived R2 signed URL for admin in-browser document preview.
 * Uses R2Service.generateViewUrl() from lib/r2/r2.service.ts.
 *
 * Permission: VENDORS_DOCUMENTS_VIEW (checked by route middleware).
 * Scope: document's country must be within actor's scope.
 */
export const handleGetDocumentSignedUrl: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { id }         = req.params as { id: string }

    const document = await prisma.vendorDocument.findUnique({
      where  : { id },
      include: {
        vendor     : { select: { countryId: true } },
        application: { select: { countryId: true } },
      },
    })

    if (!document) throw new ApiError(404, "Document not found", "NOT_FOUND")

    // Determine country from the document's owner (vendor account or application)
    const countryId = document.vendor?.countryId ?? document.application?.countryId

    // Scope guard
    if (!adminScope.isGlobal && countryId && !adminScope.countryIds.includes(countryId)) {
      throw new ApiError(403, "This document is outside your scope", "SCOPE_FORBIDDEN")
    }

    // Verify the object actually exists in R2 before generating a URL
    const exists = await R2Service.objectExists(document.storageKey)
    if (!exists) {
      throw new ApiError(404, "Document file not found in storage", "FILE_NOT_FOUND")
    }

    const url = await R2Service.generateViewUrl(document.storageKey)

    docLog.info(
      { documentId: id, mimeType: document.mimeType, actorIsGlobal: adminScope.isGlobal },
      "Document signed URL issued",
    )

    return sendSuccess(res, { url }, "Signed URL generated")
  } catch (err) { next(err) }
}