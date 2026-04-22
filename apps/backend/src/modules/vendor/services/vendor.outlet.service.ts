import { prisma, OutletReviewStatus, OutletAdminStatus } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/modules/admin/services/admin.audit.service"
import { SYSTEM_USER_ID } from "@/constants/system"
import { Filter } from "bad-words"
import { OUTLET_PROXIMITY_DEGREES, MAX_TEMP_CLOSURE_DAYS } from "@/constants/vendor"
import type { CreateOutletInput, UpdateOutletInput, OperatingHoursEntry } from "@/types/vendor"

const serviceLog = logger.child({ module: "vendor-outlet-service" })
const profanityFilter = new Filter()

//* Bounding box helper
// Simple axis-aligned bounding box check. No library needed — four comparisons.

function isInsideBoundingBox(
  latitude : number,
  longitude: number,
  north    : number,
  south    : number,
  east     : number,
  west     : number,
): boolean {
  return latitude <= north && latitude >= south && longitude <= east && longitude >= west
}

//* Bounding box validation (hard block)
// Called before outlet creation and on coordinate updates.
// If the city bounding box hasn't been configured yet by ops, we skip silently.
// Once set, coordinates outside the box are rejected — not just flagged.
// This matches how Uber Eats and Glovo work: each city has a defined service area
// and outlets outside it simply cannot be registered.

async function assertCoordinatesInCity(cityId: string, latitude: number, longitude: number) {
  const city = await prisma.city.findUnique({
    where : { id: cityId },
    select: {
      boundingBoxNorth: true,
      boundingBoxSouth: true,
      boundingBoxEast : true,
      boundingBoxWest : true,
    },
  })

  if (
    city?.boundingBoxNorth == null ||
    city?.boundingBoxSouth == null ||
    city?.boundingBoxEast  == null ||
    city?.boundingBoxWest  == null
  ) {
    return // Bounding box not yet configured — skip
  }

  const inBox = isInsideBoundingBox(
    latitude, longitude,
    city.boundingBoxNorth,
    city.boundingBoxSouth,
    city.boundingBoxEast,
    city.boundingBoxWest,
  )

  if (!inBox) {
    throw new ApiError(
      400,
      "The outlet's location falls outside the service area for this city. Please verify your coordinates.",
      "COORDINATES_OUTSIDE_CITY",
    )
  }
}

//* Flag checks

async function runFlagChecks(
  vendorId       : string,
  cityId         : string,
  name           : string,
  latitude       : number,
  longitude      : number,
  excludeOutletId?: string,
): Promise<string[]> {
  const flags: string[] = []

  if (profanityFilter.isProfane(name)) {
    flags.push("INAPPROPRIATE_NAME")
  }

  const duplicateName = await prisma.outlet.findFirst({
    where: {
      vendorId,
      cityId,
      name     : { equals: name, mode: "insensitive" },
      deletedAt: null,
      ...(excludeOutletId ? { id: { not: excludeOutletId } } : {}),
    },
  })
  if (duplicateName) flags.push("DUPLICATE_NAME_IN_CITY")

  const nearby = await prisma.outlet.findFirst({
    where: {
      vendorId,
      deletedAt: null,
      latitude : { gte: latitude  - OUTLET_PROXIMITY_DEGREES, lte: latitude  + OUTLET_PROXIMITY_DEGREES },
      longitude: { gte: longitude - OUTLET_PROXIMITY_DEGREES, lte: longitude + OUTLET_PROXIMITY_DEGREES },
      ...(excludeOutletId ? { id: { not: excludeOutletId } } : {}),
    },
  })
  if (nearby) flags.push("DUPLICATE_COORDINATES")

  return flags
}

//* Ownership guard

async function assertVendorOwnsOutlet(outletId: string, vendorId: string) {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId } })
  if (!outlet || outlet.deletedAt)  throw new ApiError(404, "Outlet not found", "NOT_FOUND")
  if (outlet.vendorId !== vendorId) throw new ApiError(403, "Unauthorized", "FORBIDDEN")
  return outlet
}

//* Flag audit logging

function logFlagEvent(outletId: string, flagReasons: string[], context: "created" | "updated") {
  auditService.log({
    adminUserId: SYSTEM_USER_ID,
    action     : "outlet.flagged",
    entityType : "Outlet",
    entityId   : outletId,
    changes    : { after: { flagReasons } },
    metadata   : { context },
  })
}

//* Create outlet

export async function createOutlet(vendorId: string, input: CreateOutletInput) {
  const {
    name, addressLine1, addressLine2, cityId, neighborhood,
    postalCode, latitude, longitude, phone, email, bio,
    deliveryRadius, minimumOrder, deliveryFee,
  } = input

  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { id: true, status: true, countryId: true },
  })
  if (!vendor) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (vendor.status !== "ACTIVE") throw new ApiError(403, "Your account is not active", "ACCOUNT_INACTIVE")

  const city = await prisma.city.findUnique({
    where : { id: cityId },
    select: { id: true, countryId: true, status: true },
  })
  if (!city) throw new ApiError(404, "City not found", "NOT_FOUND")
  if (city.countryId !== vendor.countryId) throw new ApiError(400, "City does not belong to your registered country", "CITY_COUNTRY_MISMATCH")
  if (city.status !== "ACTIVE") throw new ApiError(400, "This city is not currently active", "CITY_INACTIVE")

  await assertCoordinatesInCity(cityId, latitude, longitude)

  const flagReasons   = await runFlagChecks(vendorId, cityId, name, latitude, longitude)
  const isFlagged     = flagReasons.length > 0
  const existingCount = await prisma.outlet.count({ where: { vendorId, deletedAt: null } })

  const outlet = await prisma.outlet.create({
    data: {
      vendorId,
      cityId,
      name,
      addressLine1,
      addressLine2  : addressLine2   ?? null,
      neighborhood  : neighborhood   ?? null,
      postalCode    : postalCode     ?? null,
      latitude,
      longitude,
      phone         : phone          ?? null,
      email         : email          ?? null,
      bio           : bio            ?? null,
      deliveryRadius: deliveryRadius ?? null,
      minimumOrder  : minimumOrder   ?? null,
      deliveryFee   : deliveryFee    ?? null,
      isMainOutlet  : existingCount === 0,
      adminStatus   : OutletAdminStatus.ACTIVE,
      reviewStatus  : isFlagged ? OutletReviewStatus.FLAGGED : OutletReviewStatus.AUTO_APPROVED,
      flagReasons,
      flaggedAt     : isFlagged ? new Date() : null,
    },
  })

  if (isFlagged) {
    serviceLog.warn({ outletId: outlet.id, vendorId, flagReasons }, "Outlet flagged on creation — pending admin review")
    logFlagEvent(outlet.id, flagReasons, "created")
  } else {
    serviceLog.info({ outletId: outlet.id, vendorId }, "Outlet created and auto-approved")
  }

  return outlet
}

//* Update outlet

export async function updateOutlet(vendorId: string, outletId: string, input: UpdateOutletInput) {
  const existing = await assertVendorOwnsOutlet(outletId, vendorId)

  if (existing.adminStatus === OutletAdminStatus.BANNED) {
    throw new ApiError(403, "This outlet has been banned and cannot be edited", "OUTLET_BANNED")
  }

  const newLat  = input.latitude  ?? existing.latitude
  const newLng  = input.longitude ?? existing.longitude
  const newName = input.name      ?? existing.name

  const coordinatesChanged = input.latitude != null || input.longitude != null
  const nameChanged        = input.name != null && input.name !== existing.name

  if (coordinatesChanged) {
    await assertCoordinatesInCity(existing.cityId, newLat, newLng)
  }

  let flagReasons  = existing.flagReasons as string[]
  let reviewStatus = existing.reviewStatus

  if (coordinatesChanged || nameChanged) {
    flagReasons  = await runFlagChecks(vendorId, existing.cityId, newName, newLat, newLng, outletId)
    reviewStatus = flagReasons.length > 0 ? OutletReviewStatus.FLAGGED : OutletReviewStatus.AUTO_APPROVED
    if (flagReasons.length > 0) {
      serviceLog.warn({ outletId, vendorId, flagReasons }, "Outlet update introduced flags")
      logFlagEvent(outletId, flagReasons, "updated")
    }
  }

  const updated = await prisma.outlet.update({
    where: { id: outletId },
    data : {
      ...(input.name           != null ? { name          : input.name           } : {}),
      ...(input.addressLine1   != null ? { addressLine1  : input.addressLine1   } : {}),
      ...(input.addressLine2   != null ? { addressLine2  : input.addressLine2   } : {}),
      ...(input.neighborhood   != null ? { neighborhood  : input.neighborhood   } : {}),
      ...(input.postalCode     != null ? { postalCode    : input.postalCode     } : {}),
      ...(input.phone          != null ? { phone         : input.phone          } : {}),
      ...(input.email          != null ? { email         : input.email          } : {}),
      ...(input.bio            != null ? { bio           : input.bio            } : {}),
      ...(input.deliveryRadius != null ? { deliveryRadius: input.deliveryRadius } : {}),
      ...(input.minimumOrder   != null ? { minimumOrder  : input.minimumOrder   } : {}),
      ...(input.deliveryFee    != null ? { deliveryFee   : input.deliveryFee    } : {}),
      ...(input.latitude       != null ? { latitude      : input.latitude       } : {}),
      ...(input.longitude      != null ? { longitude     : input.longitude      } : {}),
      flagReasons,
      reviewStatus,
      flaggedAt: flagReasons.length > 0 ? new Date() : existing.flaggedAt,
    },
  })

  serviceLog.info({ outletId, vendorId }, "Outlet updated")
  return updated
}

//* Get single outlet

export async function getOutlet(vendorId: string, outletId: string) {
  const outlet = await prisma.outlet.findUnique({
    where  : { id: outletId },
    include: {
      cuisines      : { include: { cuisine: { select: { id: true, name: true, code: true } } } },
      operatingHours: { orderBy: { dayOfWeek: "asc" } },
    },
  })

  if (!outlet || outlet.deletedAt) throw new ApiError(404, "Outlet not found", "NOT_FOUND")
  if (outlet.vendorId !== vendorId) throw new ApiError(403, "Unauthorized", "FORBIDDEN")

  const city = await prisma.city.findUnique({
    where : { id: outlet.cityId },
    select: { id: true, name: true, timezone: true },
  })

  return { ...outlet, city }
}

//* List outlets

export async function listOutlets(vendorId: string) {
  const outlets = await prisma.outlet.findMany({
    where  : { vendorId, deletedAt: null },
    orderBy: [{ isMainOutlet: "desc" }, { createdAt: "asc" }],
    include: {
      cuisines: { include: { cuisine: { select: { id: true, name: true, code: true } } } },
      _count  : { select: { meals: true } },
    },
  })

  if (outlets.length === 0) return []

  const cityIds = [...new Set(outlets.map(o => o.cityId))]
  const cities  = await prisma.city.findMany({
    where : { id: { in: cityIds } },
    select: { id: true, name: true },
  })
  const cityMap = new Map(cities.map(c => [c.id, c]))

  return outlets.map(o => ({ ...o, city: cityMap.get(o.cityId) ?? null }))
}

//* Deactivate outlet

export async function deactivateOutlet(vendorId: string, outletId: string) {
  const existing = await assertVendorOwnsOutlet(outletId, vendorId)

  if (existing.adminStatus === OutletAdminStatus.BANNED) {
    throw new ApiError(403, "This outlet has been banned", "OUTLET_BANNED")
  }
  if (existing.vendorDisabledAt) {
    throw new ApiError(400, "This outlet is already deactivated", "ALREADY_DEACTIVATED")
  }

  await prisma.outlet.update({
    where: { id: outletId },
    data : {
      vendorDisabledAt      : new Date(),
      isTemporarilyClosed   : false,
      temporarilyClosedUntil: null,
    },
  })

  serviceLog.info({ outletId, vendorId }, "Outlet deactivated by vendor")
  return { success: true }
}

//* Reactivate outlet

export async function reactivateOutlet(vendorId: string, outletId: string) {
  const existing = await assertVendorOwnsOutlet(outletId, vendorId)

  if (!existing.vendorDisabledAt) {
    throw new ApiError(400, "This outlet is not deactivated", "NOT_DEACTIVATED")
  }
  if (existing.adminStatus !== OutletAdminStatus.ACTIVE) {
    throw new ApiError(403, "This outlet cannot be reactivated — contact support", "OUTLET_NOT_ACTIVE")
  }

  await prisma.outlet.update({
    where: { id: outletId },
    data : { vendorDisabledAt: null },
  })

  serviceLog.info({ outletId, vendorId }, "Outlet reactivated by vendor")
  return { success: true }
}

//* Temporarily close outlet

export async function closeOutletTemporarily(vendorId: string, outletId: string, reopenAt: Date) {
  const existing = await assertVendorOwnsOutlet(outletId, vendorId)

  if (existing.adminStatus !== OutletAdminStatus.ACTIVE) {
    throw new ApiError(403, "This outlet is not active", "OUTLET_NOT_ACTIVE")
  }
  if (existing.vendorDisabledAt) {
    throw new ApiError(400, "Outlet is deactivated. Reactivate it first.", "OUTLET_DEACTIVATED")
  }

  const now     = new Date()
  const maxDate = new Date(now.getTime() + MAX_TEMP_CLOSURE_DAYS * 24 * 60 * 60 * 1000)

  if (reopenAt <= now)    throw new ApiError(400, "Reopen date must be in the future", "INVALID_REOPEN_DATE")
  if (reopenAt > maxDate) throw new ApiError(400, `Temporary closure cannot exceed ${MAX_TEMP_CLOSURE_DAYS} days. Deactivate for longer closures.`, "CLOSURE_TOO_LONG")

  await prisma.outlet.update({
    where: { id: outletId },
    data : { isTemporarilyClosed: true, temporarilyClosedUntil: reopenAt },
  })

  serviceLog.info({ outletId, vendorId, reopenAt }, "Outlet temporarily closed")
  return { success: true, reopenAt }
}

//* Reopen outlet early

export async function reopenOutlet(vendorId: string, outletId: string) {
  const existing = await assertVendorOwnsOutlet(outletId, vendorId)

  if (!existing.isTemporarilyClosed) {
    throw new ApiError(400, "This outlet is not temporarily closed", "NOT_TEMPORARILY_CLOSED")
  }

  await prisma.outlet.update({
    where: { id: outletId },
    data : { isTemporarilyClosed: false, temporarilyClosedUntil: null },
  })

  serviceLog.info({ outletId, vendorId }, "Outlet reopened early by vendor")
  return { success: true }
}

//*Set primary outlet

export async function setPrimaryOutlet(vendorId: string, outletId: string) {
  await assertVendorOwnsOutlet(outletId, vendorId)

  await prisma.$transaction([
    prisma.outlet.updateMany({
      where: { vendorId, deletedAt: null },
      data : { isMainOutlet: false },
    }),
    prisma.outlet.update({
      where: { id: outletId },
      data : { isMainOutlet: true },
    }),
  ])

  serviceLog.info({ outletId, vendorId }, "Primary outlet updated")
  return { success: true }
}

//* Set operating hours

export async function setOperatingHours(vendorId: string, outletId: string, hours: OperatingHoursEntry[]) {
  await assertVendorOwnsOutlet(outletId, vendorId)
  if (hours.length === 0) throw new ApiError(400, "At least one day entry is required", "EMPTY_HOURS")

  await prisma.$transaction(
    hours.map(entry =>
      prisma.outletOperatingHours.upsert({
        where : { outletId_dayOfWeek_validFrom: { outletId, dayOfWeek: entry.dayOfWeek, validFrom: null! } },
        create: { outletId, ...entry, validFrom: null },
        update: { openTime: entry.openTime, closeTime: entry.closeTime, isClosed: entry.isClosed },
      })
    )
  )

  serviceLog.info({ outletId, vendorId }, "Operating hours updated")
  return { success: true }
}