import { prisma, Prisma } from "@repo/db"
import crypto from "node:crypto"
import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { R2Service } from "@/lib/r2"
import { sendEmail } from "@/lib/email/mailer"
import { getCountryIdFromSlug } from "../helpers/get-country-id.helper"
import { buildOutletInspectionEmail, type OutletInspectionKind } from "@/lib/email/templates/outlet-inspection-notice"

const serviceLog = logger.child({ module: "admin-outlet-inspection-service" })

/*
 * Admin-side outlet premises inspections — the meal-plan-eligibility gate
 * (see OutletInspection in schema.prisma, getOutletMealPlanReadiness in the
 * vendor module). Deliberately far simpler than the compliance-case
 * machinery: no claim / escalate / reassign. An admin schedules a visit,
 * conducts it, records PASS/FAIL with a checklist + photos, or waives the
 * requirement outright. Same "one MODERATE-tier permission, scope-checked
 * per call" shape as admin.outlet.service.ts.
 */

const ALLOWED_PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"]
const MAX_PHOTOS = 24
const PHOTO_PREFIX = "outlet-inspections"

type InspectionStatus = "SCHEDULED" | "IN_PROGRESS" | "PASSED" | "FAILED" | "WAIVED" | "CANCELLED"

// ─── Scope helpers ───────────────────────────────────────────────────────────

async function loadOutletInScope(outletId: string, scope: AdminScopeContext) {
  const outlet = await prisma.outlet.findUnique({
    where : { id: outletId },
    select: {
      id: true, name: true, cityId: true, vendorId: true, deletedAt: true,
      vendor: { select: { id: true, countryId: true, legalBusinessName: true, businessEmail: true } },
    },
  })
  if (!outlet || outlet.deletedAt) throw new ApiError(404, "Outlet not found", "NOT_FOUND")
  if (!scope.isGlobal && !scope.countryIds.includes(outlet.vendor.countryId)) {
    throw new ApiError(403, "This outlet is outside your scope", "SCOPE_FORBIDDEN")
  }
  return outlet
}

async function loadInspectionInScope(inspectionId: string, scope: AdminScopeContext) {
  const inspection = await prisma.outletInspection.findUnique({
    where  : { id: inspectionId },
    include: {
      outlet: {
        select: {
          id: true, name: true, cityId: true, vendorId: true,
          vendor: { select: { id: true, countryId: true, legalBusinessName: true, businessEmail: true } },
        },
      },
    },
  })
  if (!inspection) throw new ApiError(404, "Inspection not found", "NOT_FOUND")
  if (!scope.isGlobal && !scope.countryIds.includes(inspection.outlet.vendor.countryId)) {
    throw new ApiError(403, "This inspection is outside your scope", "SCOPE_FORBIDDEN")
  }
  return inspection
}

// ─── Notify (vendor, best-effort) ────────────────────────────────────────────

const VENDOR_NOTIFY_TYPE: Record<OutletInspectionKind, "OUTLET_INSPECTION_SCHEDULED" | "OUTLET_INSPECTION_PASSED" | "OUTLET_INSPECTION_FAILED" | "OUTLET_INSPECTION_CANCELLED"> = {
  SCHEDULED: "OUTLET_INSPECTION_SCHEDULED",
  PASSED   : "OUTLET_INSPECTION_PASSED",
  FAILED   : "OUTLET_INSPECTION_FAILED",
  CANCELLED: "OUTLET_INSPECTION_CANCELLED",
}

interface NotifyCtx {
  vendorId: string; vendorEmail: string; outletId: string; outletName: string
  scheduledFor?: Date | null; validUntil?: Date | null; failureReasons?: string[]; findings?: string | null
}

async function notifyVendorInspection(kind: OutletInspectionKind, c: NotifyCtx): Promise<void> {
  try {
    const email = buildOutletInspectionEmail({
      outletName: c.outletName, kind,
      scheduledFor: c.scheduledFor, validUntil: c.validUntil,
      failureReasons: c.failureReasons, findings: c.findings,
    })
    await Promise.allSettled([
      prisma.vendorNotification.create({
        data: {
          vendorId: c.vendorId,
          type    : VENDOR_NOTIFY_TYPE[kind],
          title   : email.subject,
          message : email.text.split("\n\n")[1] ?? email.subject,
          metadata: { outletId: c.outletId, kind },
        },
      }),
      sendEmail({ to: c.vendorEmail, ...email }),
    ])
  } catch (err) {
    serviceLog.error({ err, outletId: c.outletId, kind }, "notifyVendorInspection failed")
  }
}

// ─── Row shaping ─────────────────────────────────────────────────────────────

function toRow(r: {
  id: string; outletId: string; status: InspectionStatus
  scheduledFor: Date | null; inspectorAdminId: string | null
  startedAt: Date | null; completedAt: Date | null; validUntil: Date | null
  findings: string | null; failureReasons: string[]; waiveReason: string | null
  notes: string | null; photos: string[]; createdAt: Date
}) {
  return {
    id              : r.id,
    outletId        : r.outletId,
    status          : r.status,
    scheduledFor    : r.scheduledFor?.toISOString() ?? null,
    inspectorAdminId: r.inspectorAdminId,
    startedAt       : r.startedAt?.toISOString() ?? null,
    completedAt     : r.completedAt?.toISOString() ?? null,
    validUntil      : r.validUntil?.toISOString() ?? null,
    findings        : r.findings,
    failureReasons  : r.failureReasons,
    waiveReason     : r.waiveReason,
    notes           : r.notes,
    photoCount      : r.photos.length,
    createdAt       : r.createdAt.toISOString(),
  }
}

// ─── Read ────────────────────────────────────────────────────────────────────

interface ListFilters {
  status?     : InspectionStatus
  countrySlug?: string
  search?     : string
  /** Narrow to one vendor's outlets — how the queue is grouped per vendor. */
  vendorId?   : string
  page?       : number
  pageSize?   : number
}

export async function listInspections(scope: AdminScopeContext, params: ListFilters = {}) {
  const { status, search, page = 1, pageSize = 20 } = params
  const skip = (page - 1) * pageSize

  const countryId = params.countrySlug ? await getCountryIdFromSlug(params.countrySlug, scope) : undefined
  const vendorCountryFilter: Prisma.VendorAccountWhereInput = scope.isGlobal
    ? (countryId ? { countryId } : {})
    : { countryId: { in: scope.countryIds } }

  const where: Prisma.OutletInspectionWhereInput = {
    ...(status ? { status } : {}),
    outlet: {
      deletedAt: null,
      ...(params.vendorId ? { vendorId: params.vendorId } : {}),
      // The vendor filter is layered ON TOP of the scope filter, never instead
      // of it — passing a vendorId from another country still resolves to zero.
      vendor   : { ...vendorCountryFilter, deletedAt: null },
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { vendor: { legalBusinessName: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
  }

  const scopedOutletVendor: Prisma.OutletWhereInput = {
    deletedAt: null, vendor: { ...vendorCountryFilter, deletedAt: null },
  }

  const [rows, total, scheduled, inProgress, failed] = await Promise.all([
    prisma.outletInspection.findMany({
      where, skip, take: pageSize,
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }],
      include: {
        outlet: {
          select: {
            id: true, name: true, cityId: true,
            vendor: { select: { id: true, legalBusinessName: true, countryId: true } },
          },
        },
      },
    }),
    prisma.outletInspection.count({ where }),
    prisma.outletInspection.count({ where: { status: "SCHEDULED", outlet: scopedOutletVendor } }),
    prisma.outletInspection.count({ where: { status: "IN_PROGRESS", outlet: scopedOutletVendor } }),
    prisma.outletInspection.count({ where: { status: "FAILED", outlet: scopedOutletVendor } }),
  ])

  const cityIds = [...new Set(rows.map((r) => r.outlet.cityId))]
  const cities  = cityIds.length
    ? await prisma.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, name: true } })
    : []
  const cityById = new Map(cities.map((c) => [c.id, c]))

  return {
    inspections: rows.map((r) => ({
      ...toRow(r),
      outlet: { id: r.outlet.id, name: r.outlet.name },
      vendor: { id: r.outlet.vendor.id, legalBusinessName: r.outlet.vendor.legalBusinessName, countryId: r.outlet.vendor.countryId },
      city  : cityById.get(r.outlet.cityId) ? { name: cityById.get(r.outlet.cityId)!.name } : null,
    })),
    counts    : { scheduled, inProgress, failed },
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

export async function getOutletInspections(outletId: string, scope: AdminScopeContext) {
  await loadOutletInScope(outletId, scope)
  const rows = await prisma.outletInspection.findMany({
    where: { outletId }, orderBy: { createdAt: "desc" },
  })
  return rows.map(toRow)
}

export async function getInspection(inspectionId: string, scope: AdminScopeContext) {
  const r = await loadInspectionInScope(inspectionId, scope)
  const photos = await Promise.all(r.photos.map((key) => R2Service.generateViewUrl(key)))
  return {
    ...toRow(r),
    photos,
    checklist        : r.checklist,
    scheduledByAdminId: r.scheduledByAdminId,
    outlet: { id: r.outlet.id, name: r.outlet.name, vendorId: r.outlet.vendorId },
    vendor: { id: r.outlet.vendor.id, legalBusinessName: r.outlet.vendor.legalBusinessName, countryId: r.outlet.vendor.countryId },
  }
}

// ─── Schedule / conduct ──────────────────────────────────────────────────────

export async function scheduleInspection(
  outletId: string,
  input   : { scheduledFor?: string | Date | null; inspectorAdminId?: string | null; notes?: string },
  actorId : string,
  scope   : AdminScopeContext,
) {
  const outlet = await loadOutletInScope(outletId, scope)

  const active = await prisma.outletInspection.findFirst({
    where: { outletId, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
  })
  if (active) throw new ApiError(409, "This outlet already has an inspection in progress", "INSPECTION_ACTIVE")

  const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null

  const inspection = await prisma.outletInspection.create({
    data: {
      outletId,
      status            : "SCHEDULED",
      scheduledFor,
      scheduledByAdminId: actorId,
      inspectorAdminId  : input.inspectorAdminId ?? null,
      notes             : input.notes?.trim() || null,
    },
  })

  serviceLog.info({ outletId, inspectionId: inspection.id, actorId }, "Outlet inspection scheduled")
  auditService.log({
    adminUserId: actorId,
    action     : "outlet_inspection.scheduled",
    entityType : "OutletInspection",
    entityId   : inspection.id,
    changes    : { after: { outletId, scheduledFor } },
  })

  void notifyVendorInspection("SCHEDULED", {
    vendorId: outlet.vendorId, vendorEmail: outlet.vendor.businessEmail,
    outletId, outletName: outlet.name, scheduledFor,
  })

  return toRow(inspection)
}

export async function startInspection(inspectionId: string, actorId: string, scope: AdminScopeContext) {
  const inspection = await loadInspectionInScope(inspectionId, scope)
  if (inspection.status !== "SCHEDULED") {
    throw new ApiError(400, "Only a scheduled inspection can be started", "INVALID_TRANSITION")
  }

  const updated = await prisma.outletInspection.update({
    where: { id: inspectionId },
    data : { status: "IN_PROGRESS", startedAt: new Date(), inspectorAdminId: inspection.inspectorAdminId ?? actorId },
  })

  serviceLog.info({ inspectionId, actorId }, "Outlet inspection started")
  auditService.log({
    adminUserId: actorId,
    action     : "outlet_inspection.started",
    entityType : "OutletInspection",
    entityId   : inspectionId,
    changes    : { before: { status: "SCHEDULED" }, after: { status: "IN_PROGRESS" } },
  })

  return toRow(updated)
}

export async function recordInspectionOutcome(
  inspectionId: string,
  input       : {
    outcome       : "PASS" | "FAIL"
    checklist?    : unknown
    findings?     : string
    failureReasons?: string[]
    validUntil?   : string | Date | null
    photoKeys?    : string[]
  },
  actorId: string,
  scope  : AdminScopeContext,
) {
  const inspection = await loadInspectionInScope(inspectionId, scope)
  if (inspection.status !== "SCHEDULED" && inspection.status !== "IN_PROGRESS") {
    throw new ApiError(400, "This inspection already has an outcome", "INVALID_TRANSITION")
  }
  if (input.outcome === "FAIL" && (!input.failureReasons || input.failureReasons.length === 0)) {
    throw new ApiError(400, "At least one failure reason is required", "REASON_REQUIRED")
  }

  const now = new Date()
  const passed = input.outcome === "PASS"
  const validKeys = (input.photoKeys ?? []).filter(
    (k) => typeof k === "string" && k.startsWith(`${PHOTO_PREFIX}/${inspectionId}/`),
  )
  const photos = [...new Set([...inspection.photos, ...validKeys])].slice(0, MAX_PHOTOS)
  const updated = await prisma.outletInspection.update({
    where: { id: inspectionId },
    data : {
      status          : passed ? "PASSED" : "FAILED",
      completedAt      : now,
      startedAt        : inspection.startedAt ?? now,
      inspectorAdminId : inspection.inspectorAdminId ?? actorId,
      checklist        : (input.checklist ?? undefined) as Prisma.InputJsonValue | undefined,
      findings         : input.findings?.trim() || null,
      failureReasons   : passed ? [] : (input.failureReasons ?? []).map((s) => s.trim()).filter(Boolean),
      validUntil       : passed && input.validUntil ? new Date(input.validUntil) : null,
      photos,
    },
  })

  serviceLog.info({ inspectionId, actorId, outcome: input.outcome }, "Outlet inspection outcome recorded")
  auditService.log({
    adminUserId: actorId,
    action     : passed ? "outlet_inspection.passed" : "outlet_inspection.failed",
    entityType : "OutletInspection",
    entityId   : inspectionId,
    changes    : { before: { status: inspection.status }, after: { status: passed ? "PASSED" : "FAILED" } },
    metadata   : passed ? {} : { failureReasons: updated.failureReasons },
  })

  void notifyVendorInspection(passed ? "PASSED" : "FAILED", {
    vendorId: inspection.outlet.vendorId, vendorEmail: inspection.outlet.vendor.businessEmail,
    outletId: inspection.outlet.id, outletName: inspection.outlet.name,
    validUntil: updated.validUntil, failureReasons: updated.failureReasons, findings: updated.findings,
  })

  return toRow(updated)
}

export async function cancelInspection(
  inspectionId: string,
  reason      : string | undefined,
  actorId     : string,
  scope       : AdminScopeContext,
) {
  const inspection = await loadInspectionInScope(inspectionId, scope)
  if (inspection.status !== "SCHEDULED" && inspection.status !== "IN_PROGRESS") {
    throw new ApiError(400, "Only a scheduled or in-progress inspection can be cancelled", "INVALID_TRANSITION")
  }

  const updated = await prisma.outletInspection.update({
    where: { id: inspectionId },
    data : { status: "CANCELLED", notes: reason?.trim() || inspection.notes },
  })

  serviceLog.info({ inspectionId, actorId }, "Outlet inspection cancelled")
  auditService.log({
    adminUserId: actorId,
    action     : "outlet_inspection.cancelled",
    entityType : "OutletInspection",
    entityId   : inspectionId,
    changes    : { before: { status: inspection.status }, after: { status: "CANCELLED" } },
    metadata   : reason?.trim() ? { reason: reason.trim() } : {},
  })

  void notifyVendorInspection("CANCELLED", {
    vendorId: inspection.outlet.vendorId, vendorEmail: inspection.outlet.vendor.businessEmail,
    outletId: inspection.outlet.id, outletName: inspection.outlet.name,
  })

  return toRow(updated)
}

//* Waive the inspection requirement for this outlet. Any active (scheduled /
//* in-progress) inspection is closed as WAIVED; otherwise a standalone WAIVED
//* record is created so the meal-plan readiness resolver sees it.
export async function waiveInspection(
  outletId: string,
  input   : { reason: string; validUntil?: string | Date | null },
  actorId : string,
  scope   : AdminScopeContext,
) {
  if (!input.reason?.trim()) throw new ApiError(400, "A reason is required to waive an inspection", "REASON_REQUIRED")
  await loadOutletInScope(outletId, scope)

  const active = await prisma.outletInspection.findFirst({
    where: { outletId, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
  })

  const validUntil = input.validUntil ? new Date(input.validUntil) : null
  const row = active
    ? await prisma.outletInspection.update({
        where: { id: active.id },
        data : { status: "WAIVED", waiveReason: input.reason.trim(), completedAt: new Date(), validUntil, inspectorAdminId: active.inspectorAdminId ?? actorId },
      })
    : await prisma.outletInspection.create({
        data: {
          outletId, status: "WAIVED", waiveReason: input.reason.trim(),
          scheduledByAdminId: actorId, inspectorAdminId: actorId, completedAt: new Date(), validUntil,
        },
      })

  serviceLog.info({ outletId, inspectionId: row.id, actorId }, "Outlet inspection waived")
  auditService.log({
    adminUserId: actorId,
    action     : "outlet_inspection.waived",
    entityType : "OutletInspection",
    entityId   : row.id,
    changes    : { after: { status: "WAIVED", outletId } },
    metadata   : { reason: input.reason.trim() },
  })

  return toRow(row)
}

// ─── Photos ──────────────────────────────────────────────────────────────────

export async function presignInspectionPhoto(
  inspectionId: string,
  input       : { fileName: string; mimeType: string },
  scope       : AdminScopeContext,
) {
  if (!ALLOWED_PHOTO_MIME.includes(input.mimeType)) {
    throw new ApiError(400, "Only JPEG, PNG, or WebP images are allowed", "UNSUPPORTED_FILE_TYPE")
  }
  const inspection = await loadInspectionInScope(inspectionId, scope)
  if (inspection.status === "CANCELLED") throw new ApiError(400, "This inspection is cancelled", "INVALID_STATE")
  if (inspection.photos.length >= MAX_PHOTOS) throw new ApiError(400, "Photo limit reached", "PHOTO_LIMIT")

  const ext = (input.fileName.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg"
  const storageKey = `${PHOTO_PREFIX}/${inspectionId}/${crypto.randomUUID()}.${ext}`
  const uploadUrl = await R2Service.generateUploadUrl(storageKey, input.mimeType)
  return { uploadUrl, storageKey }
}

export async function attachInspectionPhotos(
  inspectionId: string,
  storageKeys : string[],
  actorId     : string,
  scope       : AdminScopeContext,
) {
  const inspection = await loadInspectionInScope(inspectionId, scope)
  const valid = storageKeys.filter((k) => typeof k === "string" && k.startsWith(`${PHOTO_PREFIX}/${inspectionId}/`))
  if (valid.length === 0) throw new ApiError(400, "No valid photo keys supplied", "NO_PHOTOS")

  const merged = [...new Set([...inspection.photos, ...valid])].slice(0, MAX_PHOTOS)
  const updated = await prisma.outletInspection.update({
    where: { id: inspectionId },
    data : { photos: merged },
  })

  serviceLog.info({ inspectionId, actorId, added: valid.length }, "Inspection photos attached")
  return toRow(updated)
}
