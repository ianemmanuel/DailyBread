import {
  prisma,
  VendorApplicationStatus,
  DocumentStatus,
  Prisma,
  SYSTEM_USER_ID,
  type VendorUser,
  type VendorApplication
} from "@repo/db"
import { ClerkVendorStateService } from "@/lib/clerk"
import { auditService } from "@/services/audit"
import { R2Service } from "@/lib/r2"
import { ApiError } from "@/errors/ApiError"
import { 
  getRequirementsWithStatus, 
  getUploadProgress, 
  assertDocumentsReadyForSubmission 
} from "./vendor.document.service"
import { 
  ensureApplicationEditable, 
  ensureScopeChangeAllowed 
} from "./vendor.application.guards"
import {
  type CreateApplicationInput,
  type UpdateApplicationInput,
  REQUIRED_APPLICATION_FIELDS,
} from "../schemas/vendor.application.schema"

/*
 * Reviewer ownership (assignedReviewerId/reviewedById) is an internal
 * admin-side accountability mechanism — see admin.vendor.service.ts's
 * claimApplication/reassignApplication. The vendor who owns this
 * application has no use for another admin's internal id and should
 * never see it, so every vendor-facing read of the full application
 * strips these two fields before returning.
 */
function omitInternalReviewerFields<T extends { assignedReviewerId: string | null; reviewedById: string | null }>(
  application: T,
) {
  const { assignedReviewerId, reviewedById, ...vendorSafe } = application
  return vendorSafe
}

//* Full, richly-included application — for the GET endpoint only.
export async function getApplication(vendorUserId: string) {
  const application = await prisma.vendorApplication.findFirst({
    where  : { userId: vendorUserId },
    include: {
      country   : true,
      vendorType: true,
      documents : {
        where  : { status: { not: DocumentStatus.WITHDRAWN } },
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!application) throw new ApiError(404, "No application found", "VENDOR_APPLICATION_NOT_FOUND")

  return omitInternalReviewerFields(application)
}

/*
  *Idempotent by design: a unique-constraint hit on userId means the
  * vendor already has an application, so we hand that back instead
  *of erroring. The one endpoint that can't use getVendorApplication,
  * since no application exists yet.
*/
export async function createApplication(vendorUser: VendorUser, input: CreateApplicationInput) {
  try {
    const application = await prisma.vendorApplication.create({
      data: {
        userId         : vendorUser.id,
        countryId      : input.countryId,
        vendorTypeId   : input.vendorTypeId,
        otherVendorType: input.otherVendorType,
        status         : VendorApplicationStatus.DRAFT,
      },
    })

    await ClerkVendorStateService.setVendorApplicationStatus(vendorUser.externalAuthId, VendorApplicationStatus.DRAFT)

    return { application, created: true as const }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.vendorApplication.findUnique({ where: { userId: vendorUser.id } })
      if (existing) return { application: existing, created: false as const }
    }
    throw err
  }
}

/* 
  * Partial update — used by every form page. `application` is
  * already resolved and ownership-checked by getVendorApplication at
  * the controller layer. Editing a NEEDS_REVISION application moves
  * it back to DRAFT and clears the prior review notes.
*/
export async function updateApplication(
  vendorUser : VendorUser,
  application: VendorApplication,
  input      : UpdateApplicationInput,
){
  ensureApplicationEditable(application.status)

  const wasNeedsRevision = application.status === VendorApplicationStatus.NEEDS_REVISION

  const updated = await prisma.vendorApplication.update({
    where: { id: application.id },
    data : {
      ...input,
      status: wasNeedsRevision ? VendorApplicationStatus.DRAFT : application.status,
      ...(wasNeedsRevision && {
        rejectionReason: null,
        revisionNotes  : null,
        reasonCode     : null,
        reviewedAt     : null,
      }),
    },
  })

  if (wasNeedsRevision) {
    await ClerkVendorStateService.setVendorApplicationStatus(vendorUser.externalAuthId, VendorApplicationStatus.DRAFT)
  }

  return updated
}

/*
  * Deliberately separate from updateMyApplication: changing country/
  * vendor type invalidates already-uploaded documents, so this
  * should never happen as a side effect of an ordinary field save —
  * and per ensureScopeChangeAllowed, only while still DRAFT.
*/
export async function changeApplicationScope(
  application: VendorApplication,
  input      : CreateApplicationInput,
) {
  ensureScopeChangeAllowed(application.status)
  const scopeChanged = application.countryId !== input.countryId || application.vendorTypeId !== input.vendorTypeId

  if (scopeChanged) {
    await clearApplicationDocuments(application.id)
  }

  const updated = await prisma.vendorApplication.update({
    where: { id: application.id },
    data : {
      countryId      : input.countryId,
      vendorTypeId   : input.vendorTypeId,
      otherVendorType: input.otherVendorType,
    },
  })

  return { application: updated, documentsCleared: scopeChanged }
}

async function clearApplicationDocuments(applicationId: string) {
  const docsToDelete = await prisma.vendorDocument.findMany({
    where: { applicationId, status: { not: DocumentStatus.WITHDRAWN } },
  })

  //? Best-effort storage cleanup — one bad R2 object shouldn't block the rest
  await Promise.allSettled(docsToDelete.map((doc) => R2Service.deleteObject(doc.storageKey)))
  await prisma.vendorDocument.deleteMany({ where: { applicationId } })
}

/*
  * applicationId here always comes from an already ownership-checked
  * application (via getVendorApplication) — re-fetched with the
  * richer include set that getMyApplication intentionally doesn't carry.
*/
export async function previewApplication(applicationId: string) {
  const application = await prisma.vendorApplication.findUniqueOrThrow({
    where  : { id: applicationId },
    include: {
      country   : true,
      vendorType: true,
      documents : {
        where  : { supersededAt: null, status: { not: DocumentStatus.WITHDRAWN } },
        include: { documentType: true },
      },
    },
  })

  const [requirements, progress] = await Promise.all([
    getRequirementsWithStatus(application),
    getUploadProgress(application),
  ])

  const missingRequired = requirements.filter((r) => r.isRequired && !r.uploaded).map((r) => r.documentTypeId)
  const missingFields   = getMissingFields(application)

  const canSubmit =
    progress.percentage === 100 &&
    missingFields.length === 0 &&
    (application.status === VendorApplicationStatus.DRAFT || application.status === VendorApplicationStatus.NEEDS_REVISION)

  return {
    application: omitInternalReviewerFields(application),
    requirements,
    progress,
    missingRequired,
    missingFields,
    canSubmit,
  }
}

//* Completeness is checked against the persisted row here

export async function submitApplication(
  vendorUser : VendorUser,
  application: VendorApplication,
  // Roadmap Phase 2 (CLAUDE.md) — optional until the vendor-dashboard
  // client actually sends it; not enforced as a required field yet.
  termsVersion?: string,
) {
  ensureApplicationEditable(application.status)

  const missingFields = getMissingFields(application)
  if (missingFields.length > 0) {
    throw new ApiError(
      400,
      "Please complete all required fields before submitting",
      "APPLICATION_INCOMPLETE",
      missingFields.map((field) => ({ field, message: "Required" })),
    )
  }

  // Replaces a bare "progress < 100%" check with a message that
  // actually names the missing documents.
  await assertDocumentsReadyForSubmission(application)

  // Only a *resubmission* is a revision — the vendor's very first
  // submit isn't one.
  const wasNeedsRevision = application.status === VendorApplicationStatus.NEEDS_REVISION

  const updated = await prisma.vendorApplication.update({
    where: { id: application.id },
    data : {
      status     : VendorApplicationStatus.SUBMITTED,
      submittedAt: new Date(),
      ...(wasNeedsRevision && { revisionCount: { increment: 1 } }),
      // Only set on a genuine first-time acceptance — a resubmission after
      // NEEDS_REVISION shouldn't silently overwrite an earlier accepted
      // version/timestamp with "now" if the client didn't actually re-ask.
      ...(termsVersion && !application.termsAcceptedAt ? { termsVersion, termsAcceptedAt: new Date() } : {}),
    },
  })

  await ClerkVendorStateService.setVendorApplicationStatus(vendorUser.externalAuthId, VendorApplicationStatus.SUBMITTED)

  // Only a genuine resubmission after NEEDS_REVISION, not the vendor's
  // first submit. Ownership (assignedReviewerId/assignedAt) is
  // deliberately untouched by this update — the application returns to
  // the same reviewer, per the reviewer-continuity requirement.
  if (wasNeedsRevision) {
    auditService.log({
      adminUserId: SYSTEM_USER_ID,
      action     : "vendor_application.resubmitted",
      entityType : "VendorApplication",
      entityId   : application.id,
      changes    : { before: { status: "NEEDS_REVISION" }, after: { status: "SUBMITTED" } },
      metadata   : { vendorUserId: vendorUser.id, assignedReviewerId: application.assignedReviewerId ?? null },
    })
  }

  return updated
}

function getMissingFields(application: VendorApplication) {
  return REQUIRED_APPLICATION_FIELDS.filter((field) => !application[field])
}