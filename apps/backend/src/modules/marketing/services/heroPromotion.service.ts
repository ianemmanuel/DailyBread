import { HeroPromotionScope, HeroPromotionStatus, prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"

import { UUID_RE } from "@/constants/system"
import { ApiError } from "@/errors/ApiError"
import { ImageRejected, normaliseSquareImage } from "@/lib/images/transform"
import { logger } from "@/lib/pino/logger"
import { R2Service } from "@/lib/r2/r2.service"
import { publicMediaStorage } from "@/lib/storage/publicMedia.storage"
import { resolveCountryIdInScope } from "@/modules/admin/lib/scope/resolve-country-id"
import { auditService } from "@/services/audit"
import {
  HERO_CROP,
  assertHeroOriginalKey,
  assertScopeShape,
  buildHeroOriginalKey,
  buildHeroPublicKey,
  resolveHeroPromotion,
  type HeroScope,
} from "../lib/heroPromotion.rules"
import { assertPromotionScope, promotionScopeWhere } from "../lib/scope"
import type {
  CreateHeroPromotionInput,
  ListHeroPromotionsInput,
  PresignHeroImageInput,
  PublishHeroPromotionInput,
  UpdateHeroPromotionInput,
} from "../schemas/heroPromotion.schema"

const serviceLog = logger.child({ module: "marketing-hero-promotion-service" })

/*
 * Hero promotions: what the customer storefront shows in its hero card, and
 * where it applies.
 *
 * The heavy lifting lives here; controllers only map and delegate. Three
 * things this service owns that nothing above it may decide:
 *
 *   1. SCOPE. Both which promotions a caller may see (promotionScopeWhere) and
 *      which they may write (assertPromotionScope). A filter never widens
 *      access, and a reference that resolves outside the caller's scope 404s
 *      exactly like one that does not exist (principle 6).
 *
 *   2. IMAGERY. The admin uploads an original to the PRIVATE bucket; this
 *      service fetches it, re-encodes it, and writes the derivative to the
 *      PUBLIC one. Every derived field is computed here — a client cannot
 *      supply imageKey, dimensions or the blur placeholder.
 *
 *   3. PUBLICATION. `status` and `publishedAt` are set only by the publish and
 *      archive paths, behind their own permission. No write schema can reach
 *      them.
 */

const PROMOTION_SELECT = {
  id: true,
  scope: true,
  cityId: true,
  countryId: true,
  eyebrow: true,
  headline: true,
  subheadline: true,
  ctaLabel: true,
  ctaHref: true,
  imageKey: true,
  imageWidth: true,
  imageHeight: true,
  imageBlurDataUrl: true,
  imageAlt: true,
  status: true,
  priority: true,
  startsAt: true,
  endsAt: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  city: { select: { id: true, name: true, slug: true } },
  country: { select: { id: true, name: true, slug: true } },
} as const

type PromotionRow = Awaited<ReturnType<typeof findPromotionOr404>>

/**
 * Turns a stored key into the shape a client renders.
 *
 * The ONE exit point where a key becomes a URL, mirroring presentMenuItem and
 * presentVendorProfile. The database never holds a URL, so changing CDN domain
 * or storage provider is a config change rather than a data migration.
 */
export function presentHeroPromotion(row: PromotionRow) {
  const { imageKey, ...rest } = row

  /* A read must never fail because the public bucket has not been provisioned
   * yet — that is a deployment concern, and crashing every list page over it
   * would be a far worse outcome than a missing picture. The warning names the
   * exact cause so it is not mistaken for a broken row. */
  if (imageKey && !publicMediaStorage.isConfigured()) {
    serviceLog.warn(
      { promotionId: row.id },
      "Hero promotion has an image but public media storage is not configured — serving it without one",
    )
  }

  return {
    ...rest,
    image:
      imageKey && publicMediaStorage.isConfigured()
      ? {
          url: publicMediaStorage.publicUrl(imageKey),
          width: row.imageWidth,
          height: row.imageHeight,
          blurDataUrl: row.imageBlurDataUrl,
          alt: row.imageAlt,
        }
      : null,
  }
}

async function findPromotionOr404(promotionId: string, scope: AdminScopeContext) {
  const promotion = await prisma.heroPromotion.findFirst({
    where: { id: promotionId, deletedAt: null, ...promotionScopeWhere(scope) },
    select: PROMOTION_SELECT,
  })
  /* Out of scope and non-existent are the same answer, deliberately —
   * otherwise the id space is probeable (principle 6). */
  if (!promotion) throw new ApiError(404, "Promotion not found", "NOT_FOUND")
  return promotion
}

/**
 * Resolves a city reference (uuid or slug) to an id, constrained to the
 * caller's scope, and returns its country too.
 *
 * The country comes back because a CITY promotion stores both: resolution
 * matches on cityId, and countryId is what lets an admin list "everything in
 * Australia" without a join.
 */
async function resolveCityInScope(
  cityRef: string,
  scope: AdminScopeContext,
): Promise<{ cityId: string; countryId: string }> {
  const city = await prisma.city.findFirst({
    where: UUID_RE.test(cityRef) ? { id: cityRef } : { slug: cityRef },
    select: { id: true, countryId: true },
  })
  if (!city) throw new ApiError(404, "City not found", "NOT_FOUND")

  const inScope =
    scope.isGlobal ||
    scope.cityIds.includes(city.id) ||
    (scope.tier === "COUNTRY" && scope.countryIds.includes(city.countryId))
  if (!inScope) throw new ApiError(404, "City not found", "NOT_FOUND")

  return { cityId: city.id, countryId: city.countryId }
}

/**
 * Works out where a promotion applies, from the refs the caller sent, and
 * proves they are allowed to write there.
 *
 * Both halves belong together: resolving a reference the caller cannot reach
 * must 404, and writing at a reach they do not hold must 403.
 */
async function resolvePlacement(
  input: { scope: HeroScope; cityRef?: string | null; countryRef?: string | null },
  scope: AdminScopeContext,
): Promise<{ scope: HeroScope; cityId: string | null; countryId: string | null }> {
  let cityId: string | null = null
  let countryId: string | null = null

  /* A GLOBAL promotion that names a place is refused, not quietly stripped.
   * Silently dropping the field would give the caller a promotion with a reach
   * they did not ask for — the same class of bug as a request field that never
   * reaches its mapper. */
  if (input.scope === "GLOBAL" && (input.cityRef || input.countryRef)) {
    throw new ApiError(
      400,
      "A global promotion cannot name a city or country.",
      "INVALID_SCOPE",
    )
  }
  /* Likewise a country promotion that also names a city. */
  if (input.scope === "COUNTRY" && input.cityRef) {
    throw new ApiError(400, "A country promotion cannot also name a city.", "INVALID_SCOPE")
  }

  if (input.scope === "CITY") {
    if (!input.cityRef) throw new ApiError(400, "A city promotion needs a city.", "MISSING_FIELDS")
    const resolved = await resolveCityInScope(input.cityRef, scope)
    cityId = resolved.cityId
    countryId = resolved.countryId
  } else if (input.scope === "COUNTRY") {
    if (!input.countryRef) {
      throw new ApiError(400, "A country promotion needs a country.", "MISSING_FIELDS")
    }
    countryId = await resolveCountryIdInScope(input.countryRef, scope)
  }

  /* A CITY row legitimately carries its country; assertScopeShape only forbids
   * the combinations that would resolve wrongly. */
  assertScopeShape(input.scope, { cityId, countryId: input.scope === "CITY" ? null : countryId })
  assertPromotionScope(scope, input.scope, { cityId, countryId })

  return { scope: input.scope, cityId, countryId }
}

/*
 * Copy fields, mapped ONE BY ONE.
 *
 * Never a spread of the parsed body: a spread is how `status`, `publishedAt`
 * or `imageKey` reaches Prisma from a client that guessed the column name.
 * This is recurring bug class #1 in reverse — every field here is deliberate,
 * and a new one has to be added on purpose.
 */
function mapCopy(input: Partial<UpdateHeroPromotionInput>) {
  const data: Record<string, unknown> = {}
  if (input.eyebrow !== undefined) data.eyebrow = input.eyebrow || null
  if (input.headline !== undefined) data.headline = input.headline
  if (input.subheadline !== undefined) data.subheadline = input.subheadline || null
  if (input.ctaLabel !== undefined) data.ctaLabel = input.ctaLabel || null
  if (input.ctaHref !== undefined) data.ctaHref = input.ctaHref || null
  if (input.priority !== undefined) data.priority = input.priority
  if (input.startsAt !== undefined) data.startsAt = input.startsAt ?? null
  if (input.endsAt !== undefined) data.endsAt = input.endsAt ?? null
  if (input.imageAlt !== undefined) data.imageAlt = input.imageAlt || null
  return data
}

function assertWindow(startsAt: Date | null, endsAt: Date | null): void {
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new ApiError(400, "The end of the run must be after its start.", "INVALID_WINDOW")
  }
}

/* ── Imagery ────────────────────────────────────────────────────────────── */

/**
 * Hands back a presigned PUT for the admin's ORIGINAL, into the private bucket.
 *
 * The browser uploads straight to storage, so the file never passes through
 * this process. The declared content type decides the key's extension and
 * nothing else — the bytes are re-read and verified when the promotion is
 * saved, because a declared type is only a claim.
 */
export async function presignHeroImageUpload(input: PresignHeroImageInput) {
  const extension = input.contentType.split("/")[1] ?? "bin"
  const storageKey = buildHeroOriginalKey(extension === "jpeg" ? "jpg" : extension)
  const uploadUrl = await R2Service.generateUploadUrl(storageKey, input.contentType)
  return { uploadUrl, storageKey }
}

/**
 * Fetches the original, re-encodes it, and publishes the derivative.
 *
 * Synchronous on purpose: there is no queue in this project, this takes a
 * second or two for one image, and an admin gets a finished promotion instead
 * of a pending state to poll. Add a queue when thousands of vendor photos need
 * one — not for a handful of admin uploads.
 */
async function processHeroImage(originalKey: string) {
  publicMediaStorage.assertConfigured()
  assertHeroOriginalKey(originalKey)

  let original: Buffer
  try {
    original = await R2Service.getObjectBuffer(originalKey)
  } catch {
    throw new ApiError(
      400,
      "That upload could not be found. Try uploading the image again.",
      "UPLOAD_NOT_FOUND",
    )
  }

  let derived
  try {
    derived = await normaliseSquareImage(original, HERO_CROP)
  } catch (err) {
    /* Surface WHICH rule the image broke — "too small", "not an image" — so
     * the admin can fix it, rather than a generic failure. */
    if (err instanceof ImageRejected) throw new ApiError(400, err.message, err.code)
    throw err
  }

  const publicKey = buildHeroPublicKey()
  await publicMediaStorage.put(publicKey, derived.buffer, derived.contentType)

  return {
    imageKey: publicKey,
    imageWidth: derived.width,
    imageHeight: derived.height,
    imageBlurDataUrl: derived.blurDataUrl,
    originalImageKey: originalKey,
  }
}

/** Best-effort cleanup of an image a promotion no longer points at. A failure
 *  here must never fail the admin's save — the row is already correct. */
async function discardPublicImage(imageKey: string | null): Promise<void> {
  if (!imageKey) return
  try {
    await publicMediaStorage.delete(imageKey)
  } catch (err) {
    serviceLog.warn({ err, imageKey }, "Could not delete a replaced hero image")
  }
}

/* ── Admin operations ───────────────────────────────────────────────────── */

export async function listHeroPromotions(
  filters: ListHeroPromotionsInput,
  scope: AdminScopeContext,
) {
  const where = {
    deletedAt: null,
    ...promotionScopeWhere(scope),
    ...(filters.scope ? { scope: filters.scope as HeroPromotionScope } : {}),
    ...(filters.status ? { status: filters.status as HeroPromotionStatus } : {}),
    ...(filters.countryRef
      ? { countryId: await resolveCountryIdInScope(filters.countryRef, scope) }
      : {}),
    ...(filters.cityRef ? { cityId: (await resolveCityInScope(filters.cityRef, scope)).cityId } : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.heroPromotion.findMany({
      where,
      /* Same ordering the resolver applies, so the list reads in the order a
       * visitor would actually get them. */
      orderBy: [{ scope: "asc" }, { priority: "desc" }, { publishedAt: "desc" }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: PROMOTION_SELECT,
    }),
    prisma.heroPromotion.count({ where }),
  ])

  return {
    items: rows.map(presentHeroPromotion),
    page: filters.page,
    pageSize: filters.pageSize,
    total,
  }
}

export async function getHeroPromotion(promotionId: string, scope: AdminScopeContext) {
  return presentHeroPromotion(await findPromotionOr404(promotionId, scope))
}

export async function createHeroPromotion(
  input: CreateHeroPromotionInput,
  actorId: string,
  scope: AdminScopeContext,
) {
  const placement = await resolvePlacement(input, scope)
  assertWindow(input.startsAt ?? null, input.endsAt ?? null)

  const imagery = input.originalImageKey ? await processHeroImage(input.originalImageKey) : {}

  const promotion = await prisma.heroPromotion.create({
    data: {
      scope: placement.scope as HeroPromotionScope,
      cityId: placement.cityId,
      countryId: placement.countryId,
      ...mapCopy(input),
      ...imagery,
      headline: input.headline,
      /* Always a draft. Becoming visible to customers is its own operation
       * behind its own permission. */
      status: HeroPromotionStatus.DRAFT,
      createdByAdminId: actorId,
      updatedByAdminId: actorId,
    },
    select: PROMOTION_SELECT,
  })

  serviceLog.info({ actorId, promotionId: promotion.id }, "Hero promotion created")
  auditService.log({
    adminUserId: actorId,
    action: "hero_promotion.created",
    entityType: "HeroPromotion",
    entityId: promotion.id,
    changes: { after: { scope: promotion.scope, headline: promotion.headline } },
  })

  return presentHeroPromotion(promotion)
}

export async function updateHeroPromotion(
  promotionId: string,
  input: UpdateHeroPromotionInput,
  actorId: string,
  scope: AdminScopeContext,
) {
  const existing = await findPromotionOr404(promotionId, scope)

  /* Moving a promotion between reaches is a scope decision in BOTH places:
   * the caller must hold the old reach (proved by findPromotionOr404's scoped
   * where) and the new one. */
  const placement = input.scope
    ? await resolvePlacement(
        { scope: input.scope, cityRef: input.cityRef, countryRef: input.countryRef },
        scope,
      )
    : null

  assertWindow(
    input.startsAt !== undefined ? (input.startsAt ?? null) : existing.startsAt,
    input.endsAt !== undefined ? (input.endsAt ?? null) : existing.endsAt,
  )

  const replacingImage =
    Boolean(input.originalImageKey) && input.originalImageKey !== existing.imageKey
  const imagery = replacingImage ? await processHeroImage(input.originalImageKey as string) : {}

  const promotion = await prisma.heroPromotion.update({
    where: { id: promotionId },
    data: {
      ...(placement
        ? {
            scope: placement.scope as HeroPromotionScope,
            cityId: placement.cityId,
            countryId: placement.countryId,
          }
        : {}),
      ...mapCopy(input),
      ...imagery,
      updatedByAdminId: actorId,
    },
    select: PROMOTION_SELECT,
  })

  /* Only after the row is committed — deleting first would leave a live
   * promotion pointing at an object that no longer exists. */
  if (replacingImage) await discardPublicImage(existing.imageKey)

  serviceLog.info({ actorId, promotionId }, "Hero promotion updated")
  auditService.log({
    adminUserId: actorId,
    action: "hero_promotion.updated",
    entityType: "HeroPromotion",
    entityId: promotionId,
    changes: { before: { headline: existing.headline }, after: { headline: promotion.headline } },
  })

  return presentHeroPromotion(promotion)
}

/**
 * Makes a promotion visible to customers.
 *
 * Its own operation and its own permission: everything else edits a draft,
 * this is the moment content reaches the public. A promotion with no image is
 * refused here rather than at save time — a half-written draft is legitimate,
 * a published one with an empty hero card is not.
 */
export async function publishHeroPromotion(
  promotionId: string,
  input: PublishHeroPromotionInput,
  actorId: string,
  scope: AdminScopeContext,
) {
  const existing = await findPromotionOr404(promotionId, scope)
  assertPromotionScope(scope, existing.scope as HeroScope, existing)

  if (!existing.imageKey) {
    throw new ApiError(
      400,
      "Add an image before publishing — the hero card needs one.",
      "IMAGE_REQUIRED",
    )
  }

  const startsAt = input.startsAt !== undefined ? (input.startsAt ?? null) : existing.startsAt
  const endsAt = input.endsAt !== undefined ? (input.endsAt ?? null) : existing.endsAt
  assertWindow(startsAt, endsAt)

  const promotion = await prisma.heroPromotion.update({
    where: { id: promotionId },
    data: {
      status: HeroPromotionStatus.PUBLISHED,
      /* Set once, on first publish. Re-publishing an archived promotion keeps
       * its original date so the resolver's newest-first tie-break stays
       * meaningful. */
      publishedAt: existing.publishedAt ?? new Date(),
      startsAt,
      endsAt,
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      updatedByAdminId: actorId,
    },
    select: PROMOTION_SELECT,
  })

  serviceLog.info({ actorId, promotionId }, "Hero promotion published")
  auditService.log({
    adminUserId: actorId,
    action: "hero_promotion.published",
    entityType: "HeroPromotion",
    entityId: promotionId,
    changes: { after: { status: promotion.status, startsAt, endsAt } },
  })

  return presentHeroPromotion(promotion)
}

/**
 * Withdraws a promotion.
 *
 * ARCHIVED, never deleted — the same rule every catalog in this codebase
 * follows, so what a market was shown last quarter stays readable. The public
 * image is deliberately left in place: it may still be in a CDN cache or a
 * page someone has open, and it costs almost nothing to keep.
 */
export async function archiveHeroPromotion(
  promotionId: string,
  actorId: string,
  scope: AdminScopeContext,
) {
  const existing = await findPromotionOr404(promotionId, scope)
  assertPromotionScope(scope, existing.scope as HeroScope, existing)

  const promotion = await prisma.heroPromotion.update({
    where: { id: promotionId },
    data: { status: HeroPromotionStatus.ARCHIVED, updatedByAdminId: actorId },
    select: PROMOTION_SELECT,
  })

  serviceLog.info({ actorId, promotionId }, "Hero promotion archived")
  auditService.log({
    adminUserId: actorId,
    action: "hero_promotion.archived",
    entityType: "HeroPromotion",
    entityId: promotionId,
    changes: { before: { status: existing.status }, after: { status: promotion.status } },
  })

  return presentHeroPromotion(promotion)
}

/* ── Resolution (the module's public surface) ───────────────────────────── */

/**
 * The promotion a visitor at this location should see: CITY, else COUNTRY,
 * else GLOBAL.
 *
 * The query pre-filters to "published and inside its run window" and orders by
 * the same columns the pure rule ranks on; `resolveHeroPromotion` then makes
 * the choice. Two steps rather than one on purpose — a rule expressed only as
 * SQL ordering is one nobody can unit-test, and this is the transcription the
 * tests hold to account (principle 4).
 *
 * `take` is bounded: a query that could return every global promotion ever
 * published is a page-size bug waiting to happen.
 */
export async function resolveHeroPromotionFor(target: {
  cityId: string | null
  countryId: string | null
}) {
  const now = new Date()

  const candidates = await prisma.heroPromotion.findMany({
    where: {
      deletedAt: null,
      status: HeroPromotionStatus.PUBLISHED,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        {
          OR: [
            { scope: HeroPromotionScope.GLOBAL },
            ...(target.countryId
              ? [{ scope: HeroPromotionScope.COUNTRY, countryId: target.countryId }]
              : []),
            ...(target.cityId
              ? [{ scope: HeroPromotionScope.CITY, cityId: target.cityId }]
              : []),
          ],
        },
      ],
    },
    orderBy: [{ scope: "asc" }, { priority: "desc" }, { publishedAt: "desc" }],
    take: 25,
    select: PROMOTION_SELECT,
  })

  const winner = resolveHeroPromotion(
    candidates.map((row) => ({ ...row, scope: row.scope as HeroScope })),
    target,
  )

  return winner ? presentHeroPromotion(winner) : null
}
