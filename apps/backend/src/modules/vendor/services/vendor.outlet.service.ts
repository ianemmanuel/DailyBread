import { validateDeliveryRadiusKm } from "@/lib/delivery/radius"
import { resolveOutletCuisines, flattenCuisineLinks } from "@/lib/menu/cuisines"
import { prisma, Prisma, OutletReviewStatus, OutletAdminStatus } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { SYSTEM_USER_ID } from "@/constants/system"
import { OUTLET_PROXIMITY_DEGREES, MAX_TEMP_CLOSURE_DAYS } from "@/constants/vendor"
import { getModerationProvider } from "@/lib/moderation"
import { resolveCapabilitiesForPoint, resolveCapabilitiesForOutlet } from "./vendor.geography.service"
import type { ResolvedZoneCapabilities } from "@repo/geo/types"
import { getOutletDocumentRequirements } from "./vendor.document.service"
import { getOutletCriticalDocuments } from "./vendor.outletDocument.service"
import { selectEnforcedCriticalRequired } from "./vendor.outletClearance"
import { validateOperatingHours } from "./vendor.operatingHours"
import type {
  CreateOutletRequest, UpdateOutletRequest,
  OutletGoLiveStatus, OutletGoLiveBlocker,
  OutletMealPlanReadiness, OutletMealPlanBlocker,
} from "@repo/types/backend"

/*
 * Doc-gated go-live (build order #3): a brand-new outlet whose city + vendor
 * type has a CRITICAL-severity required OUTLET document starts life at
 * clearanceStatus PENDING_DOCUMENTS and cannot take orders until that
 * document is uploaded and approved. A requirement with a future enforcedFrom
 * (a transition window an admin set) doesn't gate anyone yet — it applies
 * uniformly once the date passes (a later cron re-evaluates existing outlets).
 */
async function resolveInitialClearance(
  vendor: { countryId: string; vendorTypeId: string },
  cityId: string,
): Promise<"PENDING_DOCUMENTS" | "CLEARED"> {
  const reqs = await getOutletDocumentRequirements({ countryId: vendor.countryId, vendorTypeId: vendor.vendorTypeId, cityId })
  // A brand-new outlet has no documents yet, so any in-force required CRITICAL
  // requirement means it starts at PENDING_DOCUMENTS (recomputeOutletClearance
  // re-evaluates it against actual uploads on every upsert / admin review).
  return selectEnforcedCriticalRequired(reqs).length > 0 ? "PENDING_DOCUMENTS" : "CLEARED"
}

const serviceLog = logger.child({ module: "vendor-outlet-service" })

//* City-boundary enforcement + operational-zone resolution
// The outlet's coordinates must fall inside the city's operational boundary
// polygon — once one is configured. Pre-boundary cities stay lenient (matching
// the old bounding-box behaviour). The resolved operational zone is stored on
// Outlet.zoneId; a location inside the boundary but covered by no zone is left
// unzoned (the REGISTRATION_ONLY floor, resolved live). Recomputation when a
// zone's geometry later changes is handled admin-side
// (recomputeOutletZonesForCity).

async function resolveOutletPlacement(
  cityId   : string,
  latitude : number,
  longitude: number,
): Promise<ResolvedZoneCapabilities | null> {
  const placement = await resolveCapabilitiesForPoint(cityId, { latitude, longitude })
  if (!placement) return null // city was validated by the caller; treat a race as unzoned

  if (placement.boundaryConfigured && !placement.withinCityBoundary) {
    throw new ApiError(
      400,
      "The outlet's location falls outside the city operational boundary. Outlets can only be registered inside the area where the platform operates.",
      "OUTSIDE_CITY_BOUNDARY",
    )
  }
  return placement
}

/*
 * A vendor opening somewhere orders can't flow yet IS the demand signal for
 * launching there — so record it, rather than making the vendor fill in a
 * separate "register your interest" form they'd never find. The admin's city
 * geography page already aggregates MarketSignal by zone, so this lights up a
 * panel that exists but had no vendor-facing writer until now.
 *
 * Best-effort by design: a failure here must never cost the vendor an outlet
 * they successfully created. Writing prisma directly rather than calling the
 * admin module keeps the vendor module's no-admin-imports rule intact, same as
 * notifyAdminsProfileFlagged.
 */
async function captureVendorInterest(
  outlet   : { id: string; cityId: string; latitude: number; longitude: number },
  vendorId : string,
  placement: ResolvedZoneCapabilities | null,
) {
  // Somewhere we already take orders needs no signal — the outlet itself is
  // the record. Only areas that can't serve customers yet are worth counting.
  if (placement?.canListOnDemand) return

  try {
    await prisma.marketSignal.create({
      data: {
        type              : "VENDOR_INTEREST",
        cityId            : outlet.cityId,
        zoneId            : placement?.zoneId ?? null,
        latitude          : outlet.latitude,
        longitude         : outlet.longitude,
        withinCityBoundary: placement?.withinCityBoundary ?? false,
        vendorAccountId   : vendorId,
        source            : "vendor_dashboard",
        note              : "Outlet registered in an area that cannot take orders yet",
      },
    })
  } catch (err) {
    serviceLog.warn({ err, outletId: outlet.id, vendorId }, "Failed to capture vendor interest signal for a new outlet")
  }
}

//* Flag checks

/*
 * Which outlet field a moderation hit came from, so the flag an admin sees
 * names the field rather than just "inappropriate content somewhere".
 * Outlet has no flagDetails column (unlike VendorProfile), so the reason
 * string carries that granularity instead.
 */
const OUTLET_FLAG_BY_FIELD: Record<string, string> = {
  name: "INAPPROPRIATE_NAME",
  bio : "INAPPROPRIATE_DESCRIPTION",
}

async function runFlagChecks(
  vendorId       : string,
  cityId         : string,
  name           : string,
  latitude       : number,
  longitude      : number,
  excludeOutletId?: string,
  bio?           : string | null,
): Promise<string[]> {
  const flags: string[] = []

  /*
   * Every free-text field a vendor writes and an admin later reads goes
   * through the shared ContentModerationProvider — the same seam the profile
   * uses — rather than a filter instantiated here. Non-blocking in the sense
   * that matters: it only ever raises a flag for review, it never refuses the
   * save. The vendor's outlet is created either way.
   */
  const moderation = await getModerationProvider().screenText({ name, bio: bio ?? undefined })
  for (const hit of moderation) {
    const flag = OUTLET_FLAG_BY_FIELD[hit.field]
    if (flag && !flags.includes(flag)) flags.push(flag)
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

export async function createOutlet(vendorId: string, input: CreateOutletRequest) {
  const {
    name, addressLine1, addressLine2, cityId, neighborhood,
    postalCode, latitude, longitude, phone, email, bio,
    deliveryRadius, minimumOrderMinor, deliveryFeeMinor,
  } = input

  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { id: true, status: true, countryId: true, vendorTypeId: true },
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

  /*
   * The radius decides who can see this outlet at all, so a bad value is a
   * refusal rather than something to coerce. Number("abc") is NaN and
   * Number("") is 0 — both previously reached Prisma unchallenged.
   */
  const radius = validateDeliveryRadiusKm(deliveryRadius)
  if (!radius.ok) throw new ApiError(400, radius.problem.message, radius.problem.code)

  const placement = await resolveOutletPlacement(cityId, latitude, longitude)
  const zoneId = placement?.zoneId ?? null
  const clearanceStatus = await resolveInitialClearance(vendor, cityId)

  const flagReasons   = await runFlagChecks(vendorId, cityId, name, latitude, longitude, undefined, bio)
  const isFlagged     = flagReasons.length > 0
  const existingCount = await prisma.outlet.count({ where: { vendorId, deletedAt: null } })

  const outlet = await prisma.outlet.create({
    data: {
      vendorId,
      cityId,
      zoneId,
      clearanceStatus,
      clearanceUpdatedAt: clearanceStatus === "PENDING_DOCUMENTS" ? new Date() : null,
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
      deliveryRadius: radius.km,
      minimumOrderMinor : minimumOrderMinor ?? null,
      deliveryFeeMinor  : deliveryFeeMinor  ?? null,
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
    serviceLog.info({ outletId: outlet.id, vendorId, clearanceStatus }, "Outlet created")
  }

  await captureVendorInterest(outlet, vendorId, placement)

  return outlet
}

//* Update outlet

export async function updateOutlet(vendorId: string, outletId: string, input: UpdateOutletRequest) {
  const existing = await assertVendorOwnsOutlet(outletId, vendorId)

  if (existing.adminStatus === OutletAdminStatus.BANNED) {
    throw new ApiError(403, "This outlet has been banned and cannot be edited", "OUTLET_BANNED")
  }
  if (existing.adminStatus === OutletAdminStatus.SUSPENDED) {
    throw new ApiError(403, "This outlet is suspended and cannot be edited", "OUTLET_SUSPENDED")
  }
  if (existing.adminStatus === "SUSPENDED_COMPLIANCE") {
    throw new ApiError(
      403,
      "This outlet is suspended because a required document expired. Upload a current version under Documents to restore it.",
      "OUTLET_SUSPENDED_COMPLIANCE",
    )
  }

  const newLat  = input.latitude  ?? existing.latitude
  const newLng  = input.longitude ?? existing.longitude
  const newName = input.name      ?? existing.name
  const newBio  = input.bio       ?? existing.bio

  const coordinatesChanged = input.latitude != null || input.longitude != null
  const nameChanged        = input.name != null && input.name !== existing.name
  // The description is vendor-written text an admin reads, so it is screened
  // on every edit that changes it — not only on create.
  const bioChanged         = input.bio != null && input.bio !== existing.bio

  let zoneId: string | null | undefined = undefined
  if (coordinatesChanged) {
    zoneId = (await resolveOutletPlacement(existing.cityId, newLat, newLng))?.zoneId ?? null
  }

  let flagReasons     = existing.flagReasons as string[]
  let reviewStatus    = existing.reviewStatus
  let rejectionReason = existing.rejectionReason

  if (coordinatesChanged || nameChanged || bioChanged) {
    flagReasons  = await runFlagChecks(vendorId, existing.cityId, newName, newLat, newLng, outletId, newBio)
    reviewStatus = flagReasons.length > 0 ? OutletReviewStatus.FLAGGED : OutletReviewStatus.AUTO_APPROVED
    // A fresh edit supersedes a prior admin rejection — same convention
    // as vendor.profile.service.ts's upsertVendorProfile.
    rejectionReason = null
    if (flagReasons.length > 0) {
      serviceLog.warn({ outletId, vendorId, flagReasons }, "Outlet update introduced flags")
      logFlagEvent(outletId, flagReasons, "updated")
    }
  }

  /*
   * Validated on update too, and keyed on `!== undefined` rather than
   * `!= null`: an explicit null is how a merchant CLEARS the radius back to the
   * platform default, and the old `!= null` check silently discarded that.
   */
  let updatedRadiusKm: number | null = null
  if (input.deliveryRadius !== undefined) {
    const radius = validateDeliveryRadiusKm(input.deliveryRadius)
    if (!radius.ok) throw new ApiError(400, radius.problem.message, radius.problem.code)
    updatedRadiusKm = radius.km
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
      ...(input.deliveryRadius !== undefined ? { deliveryRadius: updatedRadiusKm } : {}),
      ...(input.minimumOrderMinor != null ? { minimumOrderMinor: input.minimumOrderMinor } : {}),
      ...(input.deliveryFeeMinor  != null ? { deliveryFeeMinor : input.deliveryFeeMinor  } : {}),
      ...(input.latitude       != null ? { latitude      : input.latitude       } : {}),
      ...(input.longitude      != null ? { longitude     : input.longitude      } : {}),
      ...(zoneId !== undefined ? { zoneId } : {}),
      flagReasons,
      reviewStatus,
      rejectionReason,
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
      operatingHours: { orderBy: { dayOfWeek: "asc" } },
      zone          : { select: { id: true, name: true, level: true, operationalStatus: true, status: true } },
      /*
       * Cuisines are DERIVED from the vendor's profile plus the dishes this
       * outlet actually sells. The old `cuisines` include read OutletCuisine,
       * which nothing ever wrote — so this panel has always rendered an empty
       * list. See lib/menu/cuisines.ts.
       */
      vendor: {
        select: {
          vendorProfile: {
            select: { cuisines: { select: { cuisine: { select: { id: true, name: true, slug: true } } } } },
          },
        },
      },
      meals: {
        where : { deletedAt: null },
        select: {
          menuItem: {
            select: { cuisines: { select: { cuisine: { select: { id: true, name: true, slug: true } } } } },
          },
        },
      },
    },
  })

  if (!outlet || outlet.deletedAt) throw new ApiError(404, "Outlet not found", "NOT_FOUND")
  if (outlet.vendorId !== vendorId) throw new ApiError(403, "Unauthorized", "FORBIDDEN")

  const [city, goLiveStatus, mealPlanReadiness] = await Promise.all([
    prisma.city.findUnique({
      where : { id: outlet.cityId },
      select: { id: true, name: true, timezone: true },
    }),
    getOutletGoLiveStatus(outletId),
    getOutletMealPlanReadiness(outletId),
  ])

  // The two raw relations exist only to feed the derivation; they are stripped
  // so the response keeps the flat `cuisines` shape the page already renders.
  const { vendor, meals, ...rest } = outlet
  const cuisines = resolveOutletCuisines({
    profileCuisines: flattenCuisineLinks(vendor?.vendorProfile?.cuisines),
    dishCuisines   : meals.flatMap((meal) => flattenCuisineLinks(meal.menuItem.cuisines)),
  })

  return { ...rest, cuisines, city, goLiveStatus, mealPlanReadiness }
}

//* Meal-plan eligibility — the single chokepoint a future meal-plan-creation
//* flow calls. An outlet may offer meal plans only when it's cleared for
//* on-demand serving, sits in a FULL_OPERATIONS operational zone, AND (per
//* Country.outletInspectionPolicy) has a current passing — or explicitly
//* waived — physical premises inspection. Deliberately NOT a gate on
//* on-demand serving itself, matching Uber Eats / DoorDash. Computed live,
//* never stored (OutletMealPlanReadiness).

export async function getOutletMealPlanReadiness(outletId: string): Promise<OutletMealPlanReadiness> {
  const outlet = await prisma.outlet.findUnique({
    where : { id: outletId },
    select: {
      id: true, deletedAt: true, vendorDisabledAt: true,
      clearanceStatus: true, adminStatus: true, reviewStatus: true, isTemporarilyClosed: true,
      vendor: { select: { country: { select: { outletInspectionPolicy: true } } } },
    },
  })
  if (!outlet || outlet.deletedAt) throw new ApiError(404, "Outlet not found", "NOT_FOUND")

  const [caps, latestInspection] = await Promise.all([
    resolveCapabilitiesForOutlet(outletId),
    prisma.outletInspection.findFirst({
      where  : { outletId, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      select : { status: true, validUntil: true },
    }),
  ])

  const policy = outlet.vendor.country.outletInspectionPolicy
  const inspectionRequired = policy !== "NONE"
  const zoneAllowsMealPlans = !!caps?.canOfferMealPlans
  const now = new Date()
  const blockers: OutletMealPlanBlocker[] = []

  // The outlet must first be cleared for on-demand serving at all — same set
  // of gates getOutletGoLiveStatus applies for isClearedToServe, kept in
  // lockstep so a vendor-deactivated outlet can't look meal-plan-eligible.
  const clearedToServe =
    outlet.clearanceStatus === "CLEARED" &&
    outlet.adminStatus === OutletAdminStatus.ACTIVE &&
    outlet.reviewStatus !== OutletReviewStatus.MANUALLY_REJECTED &&
    !outlet.isTemporarilyClosed &&
    !outlet.vendorDisabledAt
  if (!clearedToServe) blockers.push("NOT_CLEARED_TO_SERVE")

  if (!zoneAllowsMealPlans) blockers.push("ZONE_LEVEL_TOO_LOW")
  else if (!caps?.isOperational) blockers.push("ZONE_NOT_OPERATIONAL")

  if (inspectionRequired) {
    const s = latestInspection?.status ?? null
    if (s === null) blockers.push("INSPECTION_REQUIRED")
    else if (s === "SCHEDULED") blockers.push("INSPECTION_SCHEDULED")
    else if (s === "IN_PROGRESS") blockers.push("INSPECTION_IN_PROGRESS")
    else if (s === "FAILED") blockers.push("INSPECTION_FAILED")
    else if (s === "PASSED" && latestInspection?.validUntil && latestInspection.validUntil < now) {
      blockers.push("INSPECTION_EXPIRED")
    }
    // PASSED (unexpired) or WAIVED → no blocker.
  }

  return {
    outletId,
    eligible            : blockers.length === 0,
    policy,
    zoneAllowsMealPlans,
    inspectionRequired,
    inspectionStatus    : latestInspection?.status ?? null,
    inspectionValidUntil: latestInspection?.validUntil?.toISOString() ?? null,
    blockers,
  }
}

//* Go-live status — the outlet-level counterpart to getVendorGoLiveStatus.
//* Combines the outlet's own gates (clearance, admin status, content review,
//* vendor deactivation, temporary closure) with its operational zone (level +
//* status) and, for the customer-facing answer, whether the vendor's
//* storefront is published.
//* Computed live, never stored (OutletGoLiveStatus). Backend is the source of
//* truth — the dashboards render off this, they never re-derive it.

export async function getOutletGoLiveStatus(outletId: string): Promise<OutletGoLiveStatus> {
  const outlet = await prisma.outlet.findUnique({
    where : { id: outletId },
    select: {
      id: true, vendorId: true, deletedAt: true, vendorDisabledAt: true,
      clearanceStatus: true, adminStatus: true, reviewStatus: true, isTemporarilyClosed: true,
    },
  })
  if (!outlet || outlet.deletedAt) throw new ApiError(404, "Outlet not found", "NOT_FOUND")

  const [profile, caps, criticalDocuments] = await Promise.all([
    prisma.vendorProfile.findUnique({
      where : { vendorAccountId: outlet.vendorId },
      select: { isPublished: true },
    }),
    resolveCapabilitiesForOutlet(outletId),
    getOutletCriticalDocuments(outletId),
  ])

  const vendorPublished = profile?.isPublished ?? false
  const blockers: OutletGoLiveBlocker[] = []

  if (outlet.clearanceStatus === "PENDING_DOCUMENTS")                blockers.push("PENDING_DOCUMENTS")
  if (outlet.reviewStatus === OutletReviewStatus.MANUALLY_REJECTED)  blockers.push("REVIEW_REJECTED")
  if (outlet.adminStatus === OutletAdminStatus.SUSPENDED)            blockers.push("OUTLET_SUSPENDED")
  if (outlet.adminStatus === "SUSPENDED_COMPLIANCE")                 blockers.push("OUTLET_SUSPENDED_COMPLIANCE")
  if (outlet.adminStatus === OutletAdminStatus.BANNED)               blockers.push("OUTLET_BANNED")
  if (outlet.vendorDisabledAt)                                       blockers.push("OUTLET_DEACTIVATED")
  if (outlet.isTemporarilyClosed)                                    blockers.push("TEMPORARILY_CLOSED")

  if (!caps || !caps.canListOnDemand)  blockers.push("ZONE_LEVEL_TOO_LOW")
  else if (!caps.isOperational)        blockers.push("ZONE_NOT_OPERATIONAL")

  const isClearedToServe = blockers.length === 0
  if (!vendorPublished) blockers.push("VENDOR_NOT_LIVE")

  return {
    outletId         : outlet.id,
    clearanceStatus  : outlet.clearanceStatus,
    isClearedToServe,
    isAcceptingOrders: isClearedToServe && vendorPublished,
    vendorPublished,
    blockers,
    criticalDocuments,
    zone: {
      id               : caps?.zoneId ?? null,
      name             : caps?.zoneName ?? null,
      level            : caps?.effectiveLevel ?? null,
      operationalStatus: caps?.operationalStatus ?? null,
      onDemandAllowed  : !!caps?.canAcceptOnDemandOrders,
    },
  }
}

//* Inspection history for one of the vendor's own outlets — read-only. The
//* vendor never schedules or acts on an inspection, they just see where it
//* stands (mirrors how a vendor sees, but can't act on, a compliance case).

export async function listOutletInspectionsForVendor(vendorId: string, outletId: string) {
  await assertVendorOwnsOutlet(outletId, vendorId)
  const rows = await prisma.outletInspection.findMany({
    where  : { outletId },
    orderBy: { createdAt: "desc" },
  })
  return rows.map((r) => ({
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
  }))
}

//* List outlets

export interface ListOutletsParams {
  /** Free text over outlet name and address. */
  search?: string
  /** Outlet.adminStatus — ACTIVE | SUSPENDED | SUSPENDED_COMPLIANCE | BANNED. */
  status?: string
  cityId?: string
  page?  : number
  pageSize?: number
}

/**
 * A vendor's own outlets, paginated and filterable server-side.
 *
 * Previously returned every outlet in one unbounded array. That was fine
 * while a vendor had two or three, but the list page is the landing surface
 * for outlet management and has to hold up for a vendor running dozens —
 * filtering and slicing belong in the query, not in the page component.
 */
export async function listOutlets(vendorId: string, params: ListOutletsParams = {}) {
  const page     = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 12))

  const where: Prisma.OutletWhereInput = { vendorId, deletedAt: null }
  if (params.cityId) where.cityId = params.cityId
  if (params.status) where.adminStatus = params.status as Prisma.OutletWhereInput["adminStatus"]
  if (params.search?.trim()) {
    const q = params.search.trim()
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { addressLine1: { contains: q, mode: "insensitive" } },
    ]
  }

  const [outlets, total] = await Promise.all([
    prisma.outlet.findMany({
      where,
      orderBy: [{ isMainOutlet: "desc" }, { createdAt: "asc" }],
      skip   : (page - 1) * pageSize,
      take   : pageSize,
      // No cuisines here: nothing on the list page renders them, and deriving
      // them per row would mean a menu read for every outlet on the page.
      include: { _count: { select: { meals: true } } },
    }),
    prisma.outlet.count({ where }),
  ])

  // Outlet.cityId is a plain scalar FK, not a Prisma relation (see
  // CLAUDE.md) — city names come from a second batched query, never an
  // include.
  const cityIds = [...new Set(outlets.map((o) => o.cityId))]
  const cities  = cityIds.length
    ? await prisma.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, name: true } })
    : []
  const cityMap = new Map(cities.map((c) => [c.id, c]))

  return {
    outlets: outlets.map((o) => ({ ...o, city: cityMap.get(o.cityId) ?? null })),
    total,
    page,
    pageSize,
  }
}

/** The vendor's cities, for the list page's city filter. */
export async function listOutletCities(vendorId: string) {
  const rows = await prisma.outlet.findMany({
    where : { vendorId, deletedAt: null },
    select: { cityId: true },
    distinct: ["cityId"],
  })
  if (rows.length === 0) return []
  return prisma.city.findMany({
    where  : { id: { in: rows.map((r) => r.cityId) } },
    select : { id: true, name: true },
    orderBy: { name: "asc" },
  })
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

export async function setOperatingHours(vendorId: string, outletId: string, hours: unknown) {
  await assertVendorOwnsOutlet(outletId, vendorId)

  const parsed = validateOperatingHours(hours)
  if (!parsed.ok) {
    throw new ApiError(400, parsed.message, "INVALID_OPERATING_HOURS")
  }

  /*
   * Replace the outlet's current (open-ended) week rather than upserting day by
   * day. The previous version did:
   *
   *   upsert({ where: { outletId_dayOfWeek_validFrom: { …, validFrom: null! } } })
   *
   * which never worked — Prisma rejects `null` inside a compound-unique input
   * (the `null!` was the assertion silencing that), so every save threw a
   * PrismaClientValidationError that surfaced to the vendor as the mapper's
   * generic "Invalid data provided."
   *
   * The constraint could not have saved us anyway: `@@unique([outletId,
   * dayOfWeek, validFrom])` does not deduplicate rows where `validFrom` is
   * NULL, because Postgres treats NULLs as distinct in a unique index. So a
   * working per-day upsert would still have been able to accumulate duplicate
   * Mondays. Deleting the open-ended rows and re-inserting them in one
   * transaction is both correct and self-healing for any duplicates already
   * stored.
   *
   * Scoped to `validFrom: null` on purpose: dated, time-bounded schedules are
   * what that column is for, and this endpoint only manages the standing week.
   */
  await prisma.$transaction([
    prisma.outletOperatingHours.deleteMany({ where: { outletId, validFrom: null } }),
    prisma.outletOperatingHours.createMany({
      data: parsed.hours.map((entry) => ({ outletId, ...entry, validFrom: null })),
    }),
  ])

  serviceLog.info({ outletId, vendorId, days: parsed.hours.length }, "Operating hours updated")
  return { success: true }
}