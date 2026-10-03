import { prisma, DocumentStatus, type OutletClearanceStatus } from "@repo/db"
import path from "node:path"
import { ApiError } from "@/errors/ApiError"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { R2Service } from "@/lib/r2"
import { SYSTEM_USER_ID } from "@/constants/system"
import { getOutletDocumentRequirements } from "./vendor.document.service"
import {
  selectEnforcedCriticalRequired,
  outletCriticalDocumentsAllClear,
  computeOutletCriticalDocuments,
  type OutletCriticalDocument,
} from "./vendor.outletClearance"

/*
 * Row shape returned to the vendor dashboard — kept as a local type (not the
 * @repo/types OutletDocumentStatusRow) so `status` can be Prisma's
 * DocumentStatus directly; the shared type is the fetch-boundary contract.
 * Same pattern as vendor.accountDocument.service.ts's local row type.
 */
type ActionStatus =
  | "MISSING" | "NOT_UPLOADED" | "PENDING_REVIEW" | "APPROVED" | "EXPIRING_SOON" | "EXPIRED" | "REJECTED"

/*
 * OUTLET-scoped documents — the per-physical-location counterpart to
 * vendor.accountDocument.service.ts. Same "every replace is a new versioned
 * row, never an in-place overwrite" rule (compliance/audit history matters
 * once an outlet is live). A CRITICAL required outlet document that isn't
 * APPROVED holds the outlet at clearanceStatus PENDING_DOCUMENTS — see
 * recomputeOutletClearance, called on every upsert / admin review.
 */

const serviceLog = logger.child({ module: "vendor-outlet-document-service" })
const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"]
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

interface OutletCtx {
  id          : string
  cityId      : string
  countryId   : string
  vendorTypeId: string
  vendorUserId: string | null
}

async function loadOwnedOutlet(vendorId: string, outletId: string): Promise<OutletCtx> {
  const outlet = await prisma.outlet.findUnique({
    where : { id: outletId },
    select: {
      id: true, vendorId: true, cityId: true, deletedAt: true,
      vendor: { select: { id: true, status: true, countryId: true, vendorTypeId: true, userId: true, deletedAt: true } },
    },
  })
  // Another vendor's outlet answers exactly like a missing one (principle 6).
  if (!outlet || outlet.deletedAt || outlet.vendorId !== vendorId) {
    throw new ApiError(404, "Outlet not found", "NOT_FOUND")
  }
  if (outlet.vendor.deletedAt || outlet.vendor.status !== "ACTIVE") {
    throw new ApiError(403, "Your account is not active", "ACCOUNT_INACTIVE")
  }
  return {
    id: outlet.id, cityId: outlet.cityId,
    countryId: outlet.vendor.countryId, vendorTypeId: outlet.vendor.vendorTypeId,
    vendorUserId: outlet.vendor.userId,
  }
}

function severityOf(s: string): "LOW" | "MEDIUM" | "CRITICAL" {
  return s === "CRITICAL" ? "CRITICAL" : s === "LOW" ? "LOW" : "MEDIUM"
}

// ─── Status ──────────────────────────────────────────────────────────────────

export async function getOutletDocumentStatus(
  vendorId: string,
  outletId: string,
) {
  const outlet = await loadOwnedOutlet(vendorId, outletId)

  const [requirements, currentDocs] = await Promise.all([
    getOutletDocumentRequirements(outlet),
    prisma.outletDocument.findMany({ where: { outletId, supersededAt: null } }),
  ])
  const byType = new Map(currentDocs.map((d) => [d.documentTypeId, d]))
  const now = new Date()

  return requirements.map((type) => {
    const isRequired = type.vendorTypeConfigs[0]?.isRequired ?? type.isRequired
    const doc = byType.get(type.id) ?? null

    let actionStatus: ActionStatus
    if (!doc || doc.status === DocumentStatus.WITHDRAWN) {
      actionStatus = isRequired ? "MISSING" : "NOT_UPLOADED"
    } else if (doc.status === DocumentStatus.REJECTED) {
      actionStatus = "REJECTED"
    } else if (doc.status === DocumentStatus.EXPIRED) {
      actionStatus = "EXPIRED"
    } else if (doc.status === DocumentStatus.PENDING) {
      actionStatus = "PENDING_REVIEW"
    } else if (doc.expiryDate && doc.expiryDate < now) {
      actionStatus = "EXPIRED"
    } else if (doc.expiryDate && (doc.expiryDate.getTime() - now.getTime()) < type.expiryWarningDays * 86_400_000) {
      actionStatus = "EXPIRING_SOON"
    } else {
      actionStatus = "APPROVED"
    }

    return {
      documentTypeId  : type.id,
      documentTypeName: type.name,
      isRequired,
      requiresExpiry  : type.requiresExpiry,
      severity        : severityOf(type.complianceSeverity),
      instructions    : type.instructions,
      sampleUrl       : type.sampleUrl,
      actionStatus,
      currentDocument : doc ? {
        id             : doc.id,
        documentTypeId : doc.documentTypeId,
        status         : doc.status,
        documentName   : doc.documentName,
        mimeType       : doc.mimeType,
        issueDate      : doc.issueDate?.toISOString() ?? null,
        expiryDate     : doc.expiryDate?.toISOString() ?? null,
        rejectionReason: doc.rejectionReason,
        revisionNotes  : doc.revisionNotes,
        uploadedAt     : doc.submittedAt.toISOString(),
        version        : doc.version,
      } : null,
    }
  })
}

// ─── Upload ──────────────────────────────────────────────────────────────────

interface PresignInput { fileName: string; mimeType: string; documentTypeId: string }

export async function presignOutletDocumentUpload(vendorId: string, outletId: string, input: PresignInput) {
  if (!ALLOWED_MIME_TYPES.includes(input.mimeType)) {
    throw new ApiError(400, "Unsupported file type", "UNSUPPORTED_FILE_TYPE")
  }
  const outlet = await loadOwnedOutlet(vendorId, outletId)

  const reqs = await getOutletDocumentRequirements(outlet)
  if (!reqs.some((t) => t.id === input.documentTypeId)) {
    throw new ApiError(400, "This document type does not apply to this outlet", "DOCUMENT_TYPE_INVALID")
  }

  const extension  = path.extname(input.fileName).replace(".", "")
  const storageKey = R2Service.generateStorageKey(outlet.vendorUserId ?? vendorId, `outlet-${outletId}-${input.documentTypeId}`, extension)
  const uploadUrl  = await R2Service.generateUploadUrl(storageKey, input.mimeType)
  return { uploadUrl, storageKey }
}

interface UpsertInput {
  documentTypeId : string
  storageKey     : string
  documentName?  : string
  fileSize?      : number
  mimeType?      : string
  documentNumber?: string
  issueDate?     : string | Date
  expiryDate?    : string | Date
}

export async function upsertOutletDocument(vendorId: string, outletId: string, input: UpsertInput) {
  if (input.mimeType && !ALLOWED_MIME_TYPES.includes(input.mimeType)) {
    throw new ApiError(400, "Unsupported file type", "UNSUPPORTED_FILE_TYPE")
  }
  if (typeof input.fileSize === "number" && input.fileSize > MAX_FILE_SIZE_BYTES) {
    throw new ApiError(400, "File exceeds the maximum allowed size", "FILE_TOO_LARGE")
  }

  const outlet = await loadOwnedOutlet(vendorId, outletId)
  const reqs = await getOutletDocumentRequirements(outlet)
  const type = reqs.find((t) => t.id === input.documentTypeId)
  if (!type) throw new ApiError(400, "This document type does not apply to this outlet", "DOCUMENT_TYPE_INVALID")
  if (type.requiresExpiry && !input.expiryDate) {
    throw new ApiError(400, "This document requires an expiry date", "EXPIRY_REQUIRED")
  }

  const existing = await prisma.outletDocument.findFirst({
    where: { outletId, documentTypeId: input.documentTypeId, supersededAt: null, status: { not: DocumentStatus.WITHDRAWN } },
  })

  const now = new Date()
  const [newDoc] = await prisma.$transaction([
    prisma.outletDocument.create({
      data: {
        outletId,
        documentTypeId: input.documentTypeId,
        storageKey    : input.storageKey,
        documentName  : input.documentName ?? null,
        fileSize      : input.fileSize ?? null,
        mimeType      : input.mimeType ?? null,
        documentNumber: input.documentNumber ?? null,
        issueDate     : input.issueDate ? new Date(input.issueDate) : null,
        expiryDate    : input.expiryDate ? new Date(input.expiryDate) : null,
        status        : DocumentStatus.PENDING,
        version       : (existing?.version ?? 0) + 1,
      },
    }),
    ...(existing ? [prisma.outletDocument.update({ where: { id: existing.id }, data: { supersededAt: now } })] : []),
  ])
  if (existing) {
    await prisma.outletDocument.update({ where: { id: existing.id }, data: { supersededBy: newDoc.id } })
  }

  serviceLog.info({ vendorId, outletId, documentTypeId: input.documentTypeId, version: newDoc.version }, "Outlet document submitted")
  auditService.log({
    adminUserId: outlet.vendorUserId ?? vendorId,
    action     : "outlet_document.submitted",
    entityType : "OutletDocument",
    entityId   : newDoc.id,
    changes    : { after: { outletId, documentTypeId: input.documentTypeId, version: newDoc.version } },
  })

  // A pending replacement can only ever move clearance the "still blocked" way,
  // but recompute anyway so an outlet that lost its only approved CRITICAL doc
  // (replaced → back to PENDING) flips to PENDING_DOCUMENTS immediately.
  await recomputeOutletClearance(outletId)

  return newDoc
}

export async function getOutletDocumentViewUrl(vendorId: string, outletId: string, documentId: string) {
  await loadOwnedOutlet(vendorId, outletId)
  const doc = await prisma.outletDocument.findUnique({ where: { id: documentId }, select: { outletId: true, storageKey: true } })
  if (!doc || doc.outletId !== outletId) throw new ApiError(404, "Document not found", "NOT_FOUND")
  return { url: await R2Service.generateViewUrl(doc.storageKey) }
}

// ─── Clearance ───────────────────────────────────────────────────────────────

/*
 * The single source of truth for Outlet.clearanceStatus: an outlet is
 * PENDING_DOCUMENTS iff it has ≥1 required CRITICAL-severity OUTLET document
 * type that isn't currently APPROVED (and unexpired); otherwise CLEARED.
 * Idempotent — only writes (and audit-logs) when the value actually changes.
 * Called on every outlet-document upsert / admin review, on outlet creation
 * (build order #3), and on any change to the outlet's city or the document
 * requirements.
 */
export async function recomputeOutletClearance(outletId: string): Promise<OutletClearanceStatus> {
  const outlet = await prisma.outlet.findUnique({
    where : { id: outletId },
    select: {
      id: true, cityId: true, clearanceStatus: true,
      vendor: { select: { countryId: true, vendorTypeId: true } },
    },
  })
  if (!outlet) return "CLEARED"

  const reqs = await getOutletDocumentRequirements({
    countryId: outlet.vendor.countryId, vendorTypeId: outlet.vendor.vendorTypeId, cityId: outlet.cityId,
  })
  const criticalRequired = selectEnforcedCriticalRequired(reqs)

  let next: OutletClearanceStatus = "CLEARED"
  if (criticalRequired.length > 0) {
    const docs = await prisma.outletDocument.findMany({
      where : { outletId, documentTypeId: { in: criticalRequired.map((r) => r.id) }, supersededAt: null },
      select: { documentTypeId: true, status: true, expiryDate: true },
    })
    next = outletCriticalDocumentsAllClear(criticalRequired, docs) ? "CLEARED" : "PENDING_DOCUMENTS"
  }

  if (next !== outlet.clearanceStatus) {
    await prisma.outlet.update({
      where: { id: outletId },
      data : { clearanceStatus: next, clearanceUpdatedAt: new Date() },
    })
    serviceLog.info({ outletId, from: outlet.clearanceStatus, to: next }, "Outlet clearance recomputed")
    auditService.log({
      adminUserId: SYSTEM_USER_ID,
      action     : "outlet.clearance_changed",
      entityType : "Outlet",
      entityId   : outletId,
      changes    : { before: { clearanceStatus: outlet.clearanceStatus }, after: { clearanceStatus: next } },
    })
  }

  return next
}

/*
 * The per-document breakdown behind an outlet's PENDING_DOCUMENTS clearance —
 * every required, in-force, CRITICAL-severity OUTLET document type and where
 * it currently stands. Same requirement resolution + enforcedFrom rule as
 * recomputeOutletClearance (which decides the single clearanceStatus flag);
 * this is the itemised view getOutletGoLiveStatus surfaces. Returns [] when
 * the outlet has no CRITICAL required outlet documents at all.
 */
export async function getOutletCriticalDocuments(outletId: string): Promise<OutletCriticalDocument[]> {
  const outlet = await prisma.outlet.findUnique({
    where : { id: outletId },
    select: { cityId: true, vendor: { select: { countryId: true, vendorTypeId: true } } },
  })
  if (!outlet) return []

  const reqs = await getOutletDocumentRequirements({
    countryId: outlet.vendor.countryId, vendorTypeId: outlet.vendor.vendorTypeId, cityId: outlet.cityId,
  })
  const criticalRequired = selectEnforcedCriticalRequired(reqs)
  if (criticalRequired.length === 0) return []

  const docs = await prisma.outletDocument.findMany({
    where : { outletId, documentTypeId: { in: criticalRequired.map((r) => r.id) }, supersededAt: null },
    select: { documentTypeId: true, status: true, expiryDate: true },
  })
  return computeOutletCriticalDocuments(criticalRequired, docs)
}
