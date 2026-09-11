import { prisma, Prisma, ProfileReviewStatus, PayoutVerificationStatus, OutletAdminStatus } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { SYSTEM_USER_ID } from "@/constants/system"
import { getModerationProvider, checkImpersonation, type ModerationFlag } from "@/lib/moderation"
import { notifyAdminsProfileFlagged } from "@/lib/moderation/profile-flag-notify"
import { R2Service } from "@/lib/r2/r2.service"
import { normalizeSingleKey } from "./vendor.profileMedia"
import { resolveSelectedFoodTags } from "./vendor.foodTags"
import type {
  UpsertVendorProfileRequest, VendorGoLiveStatus, VendorGoLiveBlocker, VendorFoodTag,
} from "@repo/types/backend"

const serviceLog = logger.child({ module: "vendor-profile-service" })

async function loadActiveVendor(vendorId: string) {
  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { id: true, status: true, countryId: true, legalBusinessName: true },
  })
  if (!vendor) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (vendor.status !== "ACTIVE") throw new ApiError(403, "Your account is not active", "ACCOUNT_INACTIVE")
  return vendor
}

//* Flag checks — profanity now goes through the ContentModerationProvider
//* interface (see @/lib/moderation) so a real classifier can replace
//* bad-words without touching this service; impersonation and duplicate
//* display name are separate structured checks. All three produce
//* ModerationFlag { field, reason, match? }, collected into flagReasons
//* (distinct reasons, for simple filters) + flagDetails (the full breakdown
//* a moderator sees).

//* Same-country duplicate display name — a public brand identity should be
//* unique within one market (impersonation risk); deliberately not a
//* cross-country check, same reasoning as VM-P2-02's duplicate-payout
//* detection staying country-scoped (a match outside the admin's own
//* market isn't actionable for them and shouldn't be implied as one).
async function hasDuplicateDisplayName(displayName: string, vendorAccountId: string, countryId: string): Promise<boolean> {
  const dup = await prisma.vendorProfile.findFirst({
    where : {
      displayName    : { equals: displayName, mode: "insensitive" },
      vendorAccountId: { not: vendorAccountId },
      vendorAccount  : { countryId },
    },
    select: { id: true },
  })
  return !!dup
}

function logFlagEvent(profileId: string, flagReasons: string[], flagDetails: ModerationFlag[], context: "created" | "updated") {
  auditService.log({
    adminUserId: SYSTEM_USER_ID,
    action     : "vendor_profile.flagged",
    entityType : "VendorProfile",
    entityId   : profileId,
    changes    : { after: { flagReasons } },
    metadata   : { context, flagDetails },
  })
}

//* Get

const PROFILE_INCLUDE = {
  cuisines   : { select: { cuisine: { select: { id: true, slug: true, name: true, description: true } } } },
  dietaryTags: { select: { dietaryTag: { select: { id: true, slug: true, name: true, description: true } } } },
} as const

type ProfileWithTags = Prisma.VendorProfileGetPayload<{ include: typeof PROFILE_INCLUDE }>

/*
 * The single exit point for a profile to any client.
 *
 * The bucket is private, so a stored key is useless to a browser — every read
 * mints short-lived signed URLs here and pairs each gallery URL with the key
 * it came from, so an edit form can render an image and still know what to
 * re-submit. Keys are echoed back too; URLs are never persisted anywhere.
 *
 * Signing is best-effort per image: one unreadable object (a deleted or
 * mis-keyed file) degrades to a null URL rather than failing the whole page.
 */
async function presentVendorProfile(profile: ProfileWithTags) {
  const [logoUrl, coverImageUrl] = await Promise.all([
    signOrNull(profile.logoStorageKey),
    signOrNull(profile.coverStorageKey),
  ])

  const { cuisines, dietaryTags, ...rest } = profile

  return {
    ...rest,
    logoUrl,
    coverImageUrl,
    cuisines   : cuisines.map((c) => c.cuisine) as VendorFoodTag[],
    dietaryTags: dietaryTags.map((d) => d.dietaryTag) as VendorFoodTag[],
  }
}

/*
 * The bucket is private, so a stored key is only ever useful as a short-lived
 * signed URL. Exported because the ADMIN moderation surface needs exactly the
 * same treatment: /vendors/profiles/[id] has to show the logo and cover, or a
 * moderator cannot act on an inappropriate image. Admin importing vendor is
 * allowed (the ban is the other direction); duplicating the signing would give
 * two places that could drift on how a failure degrades.
 */
export async function signProfileMediaUrls(
  profile: { logoStorageKey: string | null; coverStorageKey: string | null },
): Promise<{ logoUrl: string | null; coverImageUrl: string | null }> {
  const [logoUrl, coverImageUrl] = await Promise.all([
    signOrNull(profile.logoStorageKey),
    signOrNull(profile.coverStorageKey),
  ])
  return { logoUrl, coverImageUrl }
}

async function signOrNull(storageKey: string | null): Promise<string | null> {
  if (!storageKey) return null
  try {
    return await R2Service.generateViewUrl(storageKey)
  } catch (err) {
    serviceLog.warn({ err, storageKey }, "Failed to sign profile media URL")
    return null
  }
}

/*
 * Deletes bucket objects a save has just orphaned — the previous logo or cover
 * when a new one is uploaded. Without this, every replacement would leak a
 * paid-for object nothing can ever reach again.
 *
 * Only keys that were referenced BEFORE and are not referenced AFTER are
 * touched, so an unchanged image is never deleted.
 */
async function discardOrphanedMedia(
  before: { logoStorageKey: string | null; coverStorageKey: string | null } | null,
  after : { logoStorageKey: string | null; coverStorageKey: string | null },
): Promise<void> {
  if (!before) return

  const kept = new Set(
    [after.logoStorageKey, after.coverStorageKey].filter((k): k is string => !!k),
  )
  const orphaned = [before.logoStorageKey, before.coverStorageKey]
    .filter((k): k is string => !!k)
    .filter((k) => !kept.has(k))

  for (const storageKey of orphaned) {
    try {
      await R2Service.deleteObject(storageKey)
    } catch (err) {
      serviceLog.warn({ err, storageKey }, "Failed to delete orphaned profile media")
    }
  }
}

export async function getVendorProfile(vendorId: string) {
  await loadActiveVendor(vendorId)
  const profile = await prisma.vendorProfile.findUnique({
    where  : { vendorAccountId: vendorId },
    include: PROFILE_INCLUDE,
  })
  return profile ? presentVendorProfile(profile) : null
}

//* Create or update — a full-form save, not a partial PATCH (see
//* UpsertVendorProfileRequest). Flags are only recomputed when a
//* profanity-relevant text field actually changes, same as
//* vendor.outlet.service.ts's updateOutlet — editing an unrelated field
//* (e.g. website) never disturbs a MANUALLY_APPROVED status an admin
//* already granted.

export async function upsertVendorProfile(vendorId: string, input: UpsertVendorProfileRequest) {
  const vendor = await loadActiveVendor(vendorId)

  const displayName = input.displayName?.trim()
  if (!displayName) throw new ApiError(400, "displayName is required", "MISSING_FIELDS")

  const existing = await prisma.vendorProfile.findUnique({ where: { vendorAccountId: vendorId } })

  const tagline     = input.tagline?.trim()     || null
  const description = input.description?.trim() || null
  const story       = input.story?.trim()       || null

  const contentChanged = !existing
    || existing.displayName !== displayName
    || existing.tagline     !== tagline
    || existing.description !== description
    || existing.story       !== story

  let reviewStatus: ProfileReviewStatus = existing?.reviewStatus ?? ProfileReviewStatus.AUTO_APPROVED
  let flagReasons  = existing?.flagReasons ?? []
  let flagDetails: ModerationFlag[] = (existing?.flagDetails as ModerationFlag[] | null) ?? []
  let flaggedAt    = existing?.flaggedAt ?? null
  let rejectionReason = existing?.rejectionReason ?? null
  let staleNotifiedAt = existing?.staleNotifiedAt ?? null
  let notifyAdmins = false

  if (contentChanged) {
    const flags: ModerationFlag[] = [
      ...(await getModerationProvider().screenText({ displayName, tagline, description, story })),
    ]
    const impersonation = checkImpersonation(displayName)
    if (impersonation) flags.push(impersonation)
    if (await hasDuplicateDisplayName(displayName, vendorId, vendor.countryId)) {
      flags.push({ field: "displayName", reason: "DUPLICATE_DISPLAY_NAME" })
    }

    const prevKey = ((existing?.flagDetails as ModerationFlag[] | null) ?? [])
      .map((f) => `${f.field}:${f.reason}:${f.match ?? ""}`).sort().join("|")
    const nextKey = flags.map((f) => `${f.field}:${f.reason}:${f.match ?? ""}`).sort().join("|")

    flagDetails  = flags
    flagReasons  = [...new Set(flags.map((f) => f.reason))]
    reviewStatus = flags.length > 0 ? ProfileReviewStatus.FLAGGED : ProfileReviewStatus.AUTO_APPROVED
    flaggedAt    = flags.length > 0 ? new Date() : null
    // Notify moderators whenever this edit introduces a flag or changes what
    // the flags are — but not when an unrelated edit leaves identical flags
    // in place (that would just be noise on a profile already in the queue).
    notifyAdmins = flags.length > 0 && nextKey !== prevKey
    // A fresh edit supersedes a prior admin rejection — it gets a clean
    // re-check rather than staying permanently marked rejected.
    rejectionReason = null
    // A fresh flag (or a fresh clean re-check) deserves a fresh
    // stale-notification clock too — same reasoning as rejectionReason.
    staleNotifiedAt = null
  }

  /*
   * Media arrives as R2 storage keys the client already uploaded to via the
   * presign step — never as bytes and never as a URL. Every key is proved to
   * belong to this vendor before it is written (assertOwnedProfileMediaKey),
   * so a hand-crafted request can't point a profile at another vendor's file.
   */
  const logoStorageKey  = normalizeSingleKey(input.logoStorageKey, vendorId)
  const coverStorageKey = normalizeSingleKey(input.coverStorageKey, vendorId)

  // Rejects anything not currently enabled in the vendor's own country rather
  // than silently dropping it — see resolveSelectedFoodTags.
  const { cuisineIds, dietaryTagIds } = await resolveSelectedFoodTags(vendor.countryId, input)

  const data = {
    displayName,
    tagline,
    description,
    story,
    logoStorageKey,
    coverStorageKey,
    publicEmail     : input.publicEmail?.trim()     || null,
    publicPhone     : input.publicPhone?.trim()     || null,
    website         : input.website?.trim()         || null,
    socialLinks     : input.socialLinks ? (JSON.parse(JSON.stringify(input.socialLinks)) as Prisma.InputJsonValue) : Prisma.JsonNull,
    primaryCuisineId: input.primaryCuisineId || null,
    foundedYear     : input.foundedYear ?? null,
    reviewStatus,
    flagReasons,
    flagDetails: flagDetails.length > 0
      ? (JSON.parse(JSON.stringify(flagDetails)) as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    flaggedAt,
    rejectionReason,
    staleNotifiedAt,
  }

  /*
   * One transaction: the profile row and its tag selections have to move
   * together, or a failed second write would leave a saved profile claiming
   * cuisines the vendor just removed.
   *
   * Selections are replaced wholesale (delete-then-create) rather than diffed
   * — this is a full-form save, the join rows carry no state of their own, and
   * a diff would be more code for an identical result.
   */
  const profile = await prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.vendorProfile.update({ where: { id: existing.id }, data })
      : await tx.vendorProfile.create({ data: { vendorAccountId: vendorId, ...data } })

    if (existing) {
      await tx.vendorProfileCuisine.deleteMany({ where: { vendorProfileId: saved.id } })
      await tx.vendorProfileDietaryTag.deleteMany({ where: { vendorProfileId: saved.id } })
    }
    if (cuisineIds.length > 0) {
      await tx.vendorProfileCuisine.createMany({
        data: cuisineIds.map((cuisineId) => ({ vendorProfileId: saved.id, cuisineId })),
      })
    }
    if (dietaryTagIds.length > 0) {
      await tx.vendorProfileDietaryTag.createMany({
        data: dietaryTagIds.map((dietaryTagId) => ({ vendorProfileId: saved.id, dietaryTagId })),
      })
    }

    return saved
  })

  /*
   * Media the vendor replaced is now unreferenced, so remove it from the
   * bucket. Best-effort and after the transaction on purpose: a storage hiccup
   * must never roll back a save the vendor was told succeeded — the same
   * trade-off upsertVendorDocument already makes on replace.
   */
  void discardOrphanedMedia(existing, { logoStorageKey, coverStorageKey })

  if (contentChanged && reviewStatus === ProfileReviewStatus.FLAGGED) {
    serviceLog.warn({ vendorId, profileId: profile.id, flagReasons }, "Vendor profile flagged — pending admin review")
    logFlagEvent(profile.id, flagReasons, flagDetails, existing ? "updated" : "created")
    if (notifyAdmins) {
      void notifyAdminsProfileFlagged({
        vendorId,
        vendorName : vendor.legalBusinessName,
        countryId  : vendor.countryId,
        displayName,
        flags      : flagDetails,
        context    : existing ? "updated" : "created",
      })
    }
  } else {
    serviceLog.info({ vendorId, profileId: profile.id }, existing ? "Vendor profile updated" : "Vendor profile created")
  }

  // Re-read with the tag joins so the caller gets the same shape as
  // getVendorProfile — signed media URLs and resolved tags — rather than a
  // bare row the form would then have to refetch to render.
  const saved = await prisma.vendorProfile.findUniqueOrThrow({
    where  : { id: profile.id },
    include: PROFILE_INCLUDE,
  })
  return presentVendorProfile(saved)
}

//* Go-live status — payout + profile + outlet, following how Uber Eats /
//* Bolt Food gate a merchant's storefront going live. Computed live, never
//* stored (see VendorGoLiveStatus).

export async function getVendorGoLiveStatus(vendorId: string): Promise<VendorGoLiveStatus> {
  const [verifiedPayoutCount, currentPayoutAccount, activeOutletCount, profile] = await Promise.all([
    prisma.vendorPayoutAccount.count({
      where: { vendorId, isActive: true, deletedAt: null, verificationStatus: PayoutVerificationStatus.VERIFIED },
    }),
    // The account the setup UI should describe — the default one, else the
    // most recently added active one. Readiness still keys only off a
    // VERIFIED count above; this is for the "why not done yet" wording.
    prisma.vendorPayoutAccount.findFirst({
      where  : { vendorId, isActive: true, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select : { verificationStatus: true },
    }),
    prisma.outlet.count({
      where: {
        vendorId, deletedAt: null,
        vendorDisabledAt  : null,                       // a vendor-deactivated outlet doesn't count
        adminStatus       : OutletAdminStatus.ACTIVE,
        clearanceStatus   : "CLEARED",
        reviewStatus      : { not: "MANUALLY_REJECTED" },
        isTemporarilyClosed: false,
      },
    }),
    prisma.vendorProfile.findUnique({
      where : { vendorAccountId: vendorId },
      select: { isPublished: true, reviewStatus: true },
    }),
  ])

  const hasVerifiedPayoutAccount = verifiedPayoutCount > 0
  const hasActiveOutlet          = activeOutletCount > 0
  const hasProfile               = !!profile
  const isProfileReviewClear     = profile
    ? profile.reviewStatus === ProfileReviewStatus.AUTO_APPROVED || profile.reviewStatus === ProfileReviewStatus.MANUALLY_APPROVED
    : false

  const blockers: VendorGoLiveBlocker[] = []
  if (!hasVerifiedPayoutAccount) blockers.push("VERIFIED_PAYOUT_ACCOUNT")
  if (!hasProfile) blockers.push("PROFILE")
  else if (!isProfileReviewClear) blockers.push("PROFILE_UNDER_REVIEW")
  if (!hasActiveOutlet) blockers.push("OUTLET")

  return {
    hasVerifiedPayoutAccount,
    payoutAccountState: currentPayoutAccount?.verificationStatus ?? "NONE",
    hasActiveOutlet,
    hasProfile,
    isProfileReviewClear,
    isPublished: profile?.isPublished ?? false,
    canGoLive  : blockers.length === 0,
    blockers,
  }
}

//* Publish — the actual "go live" action. Enforced server-side, not just
//* hinted in the UI (the vendor-dashboard also disables the button using
//* getVendorGoLiveStatus, but that's UX, not the gate).

export async function publishVendorProfile(vendorId: string) {
  await loadActiveVendor(vendorId)

  const profile = await prisma.vendorProfile.findUnique({ where: { vendorAccountId: vendorId } })
  if (!profile) throw new ApiError(400, "Create your public profile before going live", "PROFILE_NOT_FOUND")
  if (profile.reviewStatus === ProfileReviewStatus.FLAGGED) {
    throw new ApiError(400, "Your profile is pending review and cannot be published yet", "PROFILE_UNDER_REVIEW")
  }
  if (profile.reviewStatus === ProfileReviewStatus.MANUALLY_REJECTED) {
    throw new ApiError(
      400,
      profile.rejectionReason ? `Your profile was rejected: ${profile.rejectionReason}` : "Your profile was rejected by an admin",
      "PROFILE_REJECTED",
    )
  }

  // getVendorGoLiveStatus is the single authority for what "selling ready"
  // means — publish enforces exactly that, it never re-defines the rules.
  // The specific guards below are only for friendlier error messages; the
  // canGoLive backstop keeps this in lockstep with any future requirement
  // added to getVendorGoLiveStatus without needing an edit here.
  const status = await getVendorGoLiveStatus(vendorId)
  if (!status.hasVerifiedPayoutAccount) throw new ApiError(400, "Add and verify a payout account before going live", "PAYOUT_ACCOUNT_REQUIRED")
  if (!status.hasActiveOutlet) throw new ApiError(400, "Add at least one active outlet before going live", "OUTLET_REQUIRED")
  if (!status.canGoLive) {
    throw new ApiError(400, `Your storefront isn't ready to go live yet (${status.blockers.join(", ")})`, "NOT_READY_TO_GO_LIVE")
  }

  const updated = await prisma.vendorProfile.update({
    where: { id: profile.id },
    data : { isPublished: true, publishedAt: new Date() },
  })

  serviceLog.info({ vendorId, profileId: profile.id }, "Vendor profile published — vendor is live")
  return updated
}

export async function unpublishVendorProfile(vendorId: string) {
  await loadActiveVendor(vendorId)

  const profile = await prisma.vendorProfile.findUnique({ where: { vendorAccountId: vendorId } })
  if (!profile) throw new ApiError(404, "Profile not found", "NOT_FOUND")
  if (!profile.isPublished) throw new ApiError(400, "Profile is already unpublished", "ALREADY_UNPUBLISHED")

  const updated = await prisma.vendorProfile.update({
    where: { id: profile.id },
    data : { isPublished: false },
  })

  serviceLog.info({ vendorId, profileId: profile.id }, "Vendor profile unpublished by vendor")
  return updated
}
