import { prisma, ProfileReviewStatus, VendorNotificationType } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/middleware/error"
import { signProfileMediaUrls } from "@/modules/vendor/services/vendor.profile.service"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { getCountryIdFromSlug } from "../helpers/get-country-id.helper"
import { toCsv } from "@/lib/csv"

const serviceLog = logger.child({ module: "admin-vendor-profile-service" })

/*
 * Vendor public-profile moderation queue — deliberately simple, same
 * "no claim/escalate machinery" reasoning as VendorAppeal (see
 * admin.vendor.appeal.service.ts): profile-moderation volume doesn't
 * justify a workflow as heavy as applications/compliance. An admin with
 * VENDORS_PROFILES_MODERATE just approves or rejects-with-reason directly.
 */

function assertCountryInScope(countryId: string, scope: AdminScopeContext): void {
  if (!scope.isGlobal && !scope.countryIds.includes(countryId)) {
    throw new ApiError(403, "This vendor is outside your scope", "SCOPE_FORBIDDEN")
  }
}

interface VendorProfileFilters {
  status?     : ProfileReviewStatus
  countrySlug?: string
  search?     : string
}

//* Shared where-builder — used by both listVendorProfiles and
//* exportVendorProfilesCsv.
async function buildVendorProfilesWhere(params: VendorProfileFilters, scope: AdminScopeContext) {
  const { status, search } = params
  const countryId = params.countrySlug ? await getCountryIdFromSlug(params.countrySlug, scope) : undefined
  const vendorCountryFilter = scope.isGlobal
    ? (countryId ? { countryId } : {})
    : { countryId: { in: scope.countryIds } }

  // Comprehensive search, not a vendor picker — no bounded-list combobox
  // exists for "every vendor" anywhere in this app (unlike country/
  // category/docType, which are small catalogs), so a free-text search
  // across everything an admin might actually type is the right tool
  // here instead of a dropdown that could grow unusably long.
  return {
    ...(status ? { reviewStatus: status } : {}),
    vendorAccount: { ...vendorCountryFilter, deletedAt: null },
    ...(search ? {
      OR: [
        { displayName: { contains: search, mode: "insensitive" as const } },
        { vendorAccount: { legalBusinessName: { contains: search, mode: "insensitive" as const } } },
        { vendorAccount: { businessEmail: { contains: search, mode: "insensitive" as const } } },
        { vendorAccount: { ownerEmail: { contains: search, mode: "insensitive" as const } } },
        { vendorAccount: { ownerFirstName: { contains: search, mode: "insensitive" as const } } },
        { vendorAccount: { ownerLastName: { contains: search, mode: "insensitive" as const } } },
      ],
    } : {}),
  }
}

export async function listVendorProfiles(
  scope : AdminScopeContext,
  params: VendorProfileFilters & { page?: number; pageSize?: number } = {},
) {
  const { page = 1, pageSize = 20 } = params
  const skip = (page - 1) * pageSize

  const countryId = params.countrySlug ? await getCountryIdFromSlug(params.countrySlug, scope) : undefined
  const vendorCountryFilter = scope.isGlobal
    ? (countryId ? { countryId } : {})
    : { countryId: { in: scope.countryIds } }

  const where = await buildVendorProfilesWhere(params, scope)

  const [profiles, total, statusCounts] = await Promise.all([
    prisma.vendorProfile.findMany({
      where,
      skip,
      take   : pageSize,
      include: { vendorAccount: { select: { id: true, legalBusinessName: true, countryId: true } } },
      orderBy: [{ flaggedAt: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.vendorProfile.count({ where }),
    prisma.vendorProfile.groupBy({
      by    : ["reviewStatus"],
      where : { vendorAccount: { ...vendorCountryFilter, deletedAt: null } },
      _count: true,
    }),
  ])

  const counts = {
    flagged         : statusCounts.find((s) => s.reviewStatus === ProfileReviewStatus.FLAGGED)?._count ?? 0,
    autoApproved    : statusCounts.find((s) => s.reviewStatus === ProfileReviewStatus.AUTO_APPROVED)?._count ?? 0,
    manuallyApproved: statusCounts.find((s) => s.reviewStatus === ProfileReviewStatus.MANUALLY_APPROVED)?._count ?? 0,
    manuallyRejected: statusCounts.find((s) => s.reviewStatus === ProfileReviewStatus.MANUALLY_REJECTED)?._count ?? 0,
  }

  return {
    profiles: profiles.map((p) => ({ ...p, vendor: p.vendorAccount })),
    counts,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

const MAX_VENDOR_PROFILES_EXPORT_ROWS = 5000

export async function exportVendorProfilesCsv(scope: AdminScopeContext, params: VendorProfileFilters = {}): Promise<string> {
  const where = await buildVendorProfilesWhere(params, scope)
  const rows = await prisma.vendorProfile.findMany({
    where,
    take   : MAX_VENDOR_PROFILES_EXPORT_ROWS,
    orderBy: [{ flaggedAt: "desc" }, { updatedAt: "desc" }],
    include: { vendorAccount: { select: { legalBusinessName: true } } },
  })
  return toCsv(rows.map((p) => ({
    vendor         : p.vendorAccount.legalBusinessName,
    displayName    : p.displayName,
    reviewStatus   : p.reviewStatus,
    isPublished    : p.isPublished,
    flagReasons    : p.flagReasons.join("; "),
    rejectionReason: p.rejectionReason ?? "",
    updatedAt      : p.updatedAt.toISOString().slice(0, 10),
  })), [
    { key: "vendor",          label: "Vendor" },
    { key: "displayName",     label: "Display Name" },
    { key: "reviewStatus",    label: "Review Status" },
    { key: "isPublished",     label: "Published" },
    { key: "flagReasons",     label: "Flag Reasons" },
    { key: "rejectionReason", label: "Rejection Reason" },
    { key: "updatedAt",       label: "Last Updated" },
  ])
}

async function getProfileWithScope(vendorId: string, scope: AdminScopeContext) {
  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { id: true, legalBusinessName: true, countryId: true, deletedAt: true },
  })
  if (!vendor || vendor.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  assertCountryInScope(vendor.countryId, scope)

  const profile = await prisma.vendorProfile.findUnique({ where: { vendorAccountId: vendorId } })
  if (!profile) throw new ApiError(404, "This vendor has no public profile yet", "NOT_FOUND")

  return { vendor, profile }
}

/*
 * The moderation detail page's one read.
 *
 * Deliberately richer than the list row: the whole point of the page is that a
 * moderator sees every field a customer would, in one place, before deciding.
 * That includes the LOGO AND COVER — /vendors/profiles could only ever moderate
 * flagged text, so an inappropriate image had no surface to be acted on at all.
 * The keys are private, so they leave as short-lived signed URLs, using the
 * vendor module's own signer rather than a second copy that could drift.
 *
 * The reviewer id is resolved to a name here rather than on the page, so the
 * frontend never needs a second round trip to answer "who decided this".
 */
export async function getVendorProfileForAdmin(vendorId: string, scope: AdminScopeContext) {
  const { vendor, profile } = await getProfileWithScope(vendorId, scope)

  const [media, tags, reviewer] = await Promise.all([
    signProfileMediaUrls(profile),
    prisma.vendorProfile.findUnique({
      where : { id: profile.id },
      select: {
        cuisines   : { select: { cuisine   : { select: { id: true, name: true, status: true } } } },
        dietaryTags: { select: { dietaryTag: { select: { id: true, name: true, status: true } } } },
      },
    }),
    profile.reviewedByAdminId
      ? prisma.adminUser.findUnique({
          where : { id: profile.reviewedByAdminId },
          select: { firstName: true, lastName: true, email: true },
        })
      : Promise.resolve(null),
  ])

  return {
    ...profile,
    ...media,
    cuisines   : (tags?.cuisines    ?? []).map((c) => c.cuisine),
    dietaryTags: (tags?.dietaryTags ?? []).map((d) => d.dietaryTag),
    reviewedBy : reviewer
      ? {
          name : [reviewer.firstName, reviewer.lastName].filter(Boolean).join(" ") || reviewer.email,
          email: reviewer.email,
        }
      : null,
    vendor: { id: vendor.id, legalBusinessName: vendor.legalBusinessName, countryId: vendor.countryId },
  }
}

//* Approve — clears the flag (kept in flagReasons as history, not erased)
//* and marks it publishable. Does not itself publish — the vendor still
//* has to hit "Go Live" themselves.

export async function approveVendorProfile(vendorId: string, actorId: string, scope: AdminScopeContext) {
  const { profile } = await getProfileWithScope(vendorId, scope)
  if (profile.reviewStatus === ProfileReviewStatus.MANUALLY_APPROVED) {
    throw new ApiError(400, "This profile is already approved", "ALREADY_APPROVED")
  }

  const updated = await prisma.vendorProfile.update({
    where: { id: profile.id },
    data : {
      reviewStatus     : ProfileReviewStatus.MANUALLY_APPROVED,
      reviewedAt        : new Date(),
      reviewedByAdminId: actorId,
      rejectionReason   : null,
    },
  })

  serviceLog.info({ vendorId, profileId: profile.id, actorId }, "Vendor profile approved")
  auditService.log({
    adminUserId: actorId,
    action     : "vendor_profile.approved",
    entityType : "VendorProfile",
    entityId   : profile.id,
    changes    : { before: { reviewStatus: profile.reviewStatus }, after: { reviewStatus: "MANUALLY_APPROVED" } },
  })

  return updated
}

//* Reject — blocks publish, and force-unpublishes if it was already live
//* (same "the flag wins" reasoning as compliance never leaving a known
//* issue silently live). Notifies the vendor in-app so they know to fix it.

export async function rejectVendorProfile(
  vendorId: string,
  reason  : string,
  actorId : string,
  scope   : AdminScopeContext,
) {
  if (!reason?.trim()) throw new ApiError(400, "A reason is required to reject a profile", "REASON_REQUIRED")

  const { profile } = await getProfileWithScope(vendorId, scope)
  if (profile.reviewStatus === ProfileReviewStatus.MANUALLY_REJECTED) {
    throw new ApiError(400, "This profile is already rejected", "ALREADY_REJECTED")
  }

  const wasPublished = profile.isPublished

  const [updated] = await prisma.$transaction([
    prisma.vendorProfile.update({
      where: { id: profile.id },
      data : {
        reviewStatus     : ProfileReviewStatus.MANUALLY_REJECTED,
        reviewedAt        : new Date(),
        reviewedByAdminId: actorId,
        rejectionReason   : reason.trim(),
        isPublished        : false,
        publishedAt        : wasPublished ? null : profile.publishedAt,
      },
    }),
    prisma.vendorNotification.create({
      data: {
        vendorId,
        type   : VendorNotificationType.PROFILE_REJECTED,
        title  : "Your public profile was rejected",
        message: reason.trim(),
      },
    }),
  ])

  serviceLog.warn({ vendorId, profileId: profile.id, actorId, wasPublished }, "Vendor profile rejected")
  auditService.log({
    adminUserId: actorId,
    action     : "vendor_profile.rejected",
    entityType : "VendorProfile",
    entityId   : profile.id,
    changes    : { before: { reviewStatus: profile.reviewStatus, isPublished: wasPublished }, after: { reviewStatus: "MANUALLY_REJECTED", isPublished: false } },
    metadata   : { reason: reason.trim(), forceUnpublished: wasPublished },
  })

  return updated
}

//* Powers the sidebar's Profiles nav dot — gated on VENDORS_PROFILES_MODERATE
//* specifically (not the broader READ), per explicit direction: only
//* admins who can actually act on a flagged profile get nudged about one.
export async function hasFlaggedProfilesForCountries(countryIds: string[]): Promise<boolean> {
  if (countryIds.length === 0) return false
  const flagged = await prisma.vendorProfile.findFirst({
    where : { reviewStatus: ProfileReviewStatus.FLAGGED, vendorAccount: { countryId: { in: countryIds }, deletedAt: null } },
    select: { id: true },
  })
  return !!flagged
}
