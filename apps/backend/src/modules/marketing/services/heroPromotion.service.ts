import { HeroPromotionScope, HeroPromotionStatus, prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import {
  type HeroPromotionPriorityTier,
  priorityForTier,
  tierForPriority,
} from "@repo/types/enums"

import { UUID_RE } from "@/constants/system"
import { ApiError } from "@/errors/ApiError"
import {
  discardPublicImage,
  presignOriginalUpload,
  processPublicSquareImage,
} from "@/lib/images/publicImage"
import { logger } from "@/lib/pino/logger"
import { R2Service } from "@/lib/r2/r2.service"
import { publicMediaStorage } from "@/lib/storage/publicMedia.storage"
import { revalidateStorefront } from "@/lib/storefront/revalidate"
import { resolveCountryIdInScope } from "@/modules/admin/lib/scope/resolve-country-id"
import { auditService } from "@/services/audit"
import {
  HERO_CROP,
  HERO_ORIGINAL_PREFIX,
  HERO_PUBLIC_PREFIX,
  assertPriorityWindow,
  assertScopeShape,
  assertWindowNotElapsed,
  buildHeroOriginalKey,
  buildHeroPublicKey,
  resolveHeroPromotion,
  type HeroScope,
} from "../lib/heroPromotion.rules"
import { assertPromotionScope, canManagePromotion } from "../lib/scope"
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
 *   1. SCOPE — of WRITES only. Reading is deliberately unscoped: everyone with
 *      `marketing:promotions:read` sees every promotion at every reach, because
 *      a hero promotion is public marketing copy with nothing to protect
 *      (lib/scope.ts sets this out). Every write path calls
 *      assertPromotionScope against the promotion's OWN reach, and a write
 *      refused for scope answers 403, not 404 — the row's existence is not a
 *      secret, so principle 6's reason for hiding it does not apply here.
 *
 *   1b. PRIORITY. The API takes a named tier; the column stores its number.
 *      Anything above STANDARD is a campaign and must carry an end date.
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
export function presentHeroPromotion(row: PromotionRow, scope?: AdminScopeContext) {
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
    /* Derived here, never stored: the band is a presentation of the number and
     * the ERP must not re-compute it (one definition, principle 1). */
    priorityTier: tierForPriority(row.priority),
    /* Omitted (false) for a caller with no scope context — only the admin
     * surface passes one, and the public presenter drops the field entirely. */
    canManage: scope
      ? canManagePromotion(scope, row.scope as HeroScope, {
          cityId: row.cityId,
          countryId: row.countryId,
        })
      : false,
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

/**
 * The PUBLIC shape — what an anonymous visitor on the storefront receives.
 *
 * Deliberately NOT presentHeroPromotion. That one is the ADMIN record: status,
 * priority, the run window, publishedAt/createdAt/updatedAt, the row id and the
 * resolved city/country. None of it is rendered by the hero, and all of it was
 * being handed to an unauthenticated endpoint.
 *
 * The risk is not that today's fields are secret — they are not. It is the
 * DEFAULT: with the admin presenter wired to a public route, every column added
 * to this table in future is published to the world automatically, and nobody
 * making that change would think to check. A narrow allowlist inverts that, so
 * exposing something new has to be a deliberate edit to this function.
 *
 * Built on top of presentHeroPromotion rather than beside it, so the imageKey →
 * URL rule and its unconfigured-bucket guard live in exactly one place.
 */
export function presentPublicHeroPromotion(row: PromotionRow) {
  const { eyebrow, headline, subheadline, ctaLabel, ctaHref, image } =
    presentHeroPromotion(row)

  return { eyebrow, headline, subheadline, ctaLabel, ctaHref, image }
}

/**
 * Finds a promotion, or 404s because it genuinely is not there.
 *
 * NOT scope-filtered: every admin with :read may see every promotion (see
 * lib/scope.ts for why that is safe here). A caller who may see but not write
 * is refused by `assertPromotionScope` at the write itself, with a 403 — the
 * honest answer, since the row's existence is not a secret.
 */
async function findPromotionOr404(promotionId: string) {
  const promotion = await prisma.heroPromotion.findFirst({
    where: { id: promotionId, deletedAt: null },
    select: PROMOTION_SELECT,
  })
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

/*
 * Reference resolvers for LIST FILTERS.
 *
 * Separate from resolveCityInScope / resolveCountryIdInScope on purpose, and
 * the difference is the whole point: those two are WRITE guards and must 404
 * a place the caller cannot reach. A filter is a view, and reading is not
 * scoped here, so narrowing it would make "show me Australia's promotions"
 * fail for an admin who is perfectly entitled to look.
 *
 * They still resolve a real row or 404 — an unknown ref is an error, not an
 * empty filter that silently returns everything.
 */
async function resolveCountryIdForFilter(ref: string): Promise<string> {
  const country = await prisma.country.findFirst({
    where: UUID_RE.test(ref) ? { id: ref } : { slug: ref },
    select: { id: true },
  })
  if (!country) throw new ApiError(404, "Country not found", "NOT_FOUND")
  return country.id
}

async function resolveCityIdForFilter(ref: string): Promise<string> {
  const city = await prisma.city.findFirst({
    where: UUID_RE.test(ref) ? { id: ref } : { slug: ref },
    select: { id: true },
  })
  if (!city) throw new ApiError(404, "City not found", "NOT_FOUND")
  return city.id
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
  /* And a city promotion that also names a country. The row DOES store a
   * country, but it is derived from the city below — so a countryRef here is
   * either redundant or contradicts the city, and in both cases it was being
   * accepted and then silently ignored. Same class as the GLOBAL case above
   * (recurring bug class #1): a field a caller can send and never see applied. */
  if (input.scope === "CITY" && input.countryRef) {
    throw new ApiError(
      400,
      "A city promotion takes its country from the city; do not send one.",
      "INVALID_SCOPE",
    )
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
  if (input.priorityTier !== undefined) data.priority = priorityForTier(input.priorityTier)
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
  return presignOriginalUpload({
    prefix: HERO_ORIGINAL_PREFIX,
    contentType: input.contentType,
  })
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
  return processPublicSquareImage({
    originalKey,
    originalPrefix: HERO_ORIGINAL_PREFIX,
    publicPrefix: HERO_PUBLIC_PREFIX,
    crop: HERO_CROP,
  })
}

/** Best-effort cleanup of an image a promotion no longer points at. */
async function discardHeroImage(imageKey: string | null): Promise<void> {
  return discardPublicImage(imageKey, "hero-promotion")
}

/* ── Admin operations ───────────────────────────────────────────────────── */

export async function listHeroPromotions(
  filters: ListHeroPromotionsInput,
  scope: AdminScopeContext,
) {
  /* No scope narrowing: every admin with :read sees every promotion, at every
   * reach (lib/scope.ts explains why that is safe and wanted). The filters
   * below are the admin's own choice of view, not a permission. */
  const where = {
    deletedAt: null,
    ...(filters.scope ? { scope: filters.scope as HeroPromotionScope } : {}),
    ...(filters.status ? { status: filters.status as HeroPromotionStatus } : {}),
    ...(filters.priorityTier ? { priority: priorityForTier(filters.priorityTier) } : {}),
    ...(filters.countryRef ? { countryId: await resolveCountryIdForFilter(filters.countryRef) } : {}),
    ...(filters.cityRef ? { cityId: await resolveCityIdForFilter(filters.cityRef) } : {}),
  }

  const [rows, total, byStatus, fallback] = await Promise.all([
    prisma.heroPromotion.findMany({
      where,
      /* The SAME three keys, in the same order, as resolveHeroPromotion —
       * priority, then specificity, then newest. The list therefore reads in
       * the order a visitor would actually get them. */
      orderBy: [{ priority: "desc" }, { scope: "asc" }, { publishedAt: "desc" }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: PROMOTION_SELECT,
    }),
    prisma.heroPromotion.count({ where }),
    /* Counts across ALL promotions, not the filtered view — the whole point is
     * to surface the drafts you are not currently looking at. One grouped
     * query, not three counts. */
    prisma.heroPromotion.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    resolveHeroPromotionFor({ cityId: null, countryId: null }),
  ])

  const statusCounts = { DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0 }
  for (const group of byStatus) {
    statusCounts[group.status as keyof typeof statusCounts] = group._count._all
  }

  return {
    items: rows.map((row) => presentHeroPromotion(row, scope)),
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    /* Unfiltered, so a draft nobody published is visible from every view. It
     * is far too easy to create a promotion, navigate away, and never learn
     * that it is still sitting in DRAFT. */
    statusCounts,
    /*
     * WHAT A VISITOR WITH NO LOCATION SEES RIGHT NOW — resolved through the
     * exact function the storefront calls, never a re-implementation.
     *
     * `null` is the state worth shouting about: nothing is scheduled globally,
     * so the storefront is falling back to its own built-in hero. That is the
     * answer to "what happens when a promotion expires", and until now it was
     * invisible from the ERP.
     */
    globalFallback: fallback
      ? { headline: fallback.headline, hasImage: Boolean(fallback.image) }
      : null,
  }
}

export async function getHeroPromotion(promotionId: string, scope: AdminScopeContext) {
  return presentHeroPromotion(await findPromotionOr404(promotionId), scope)
}

export async function createHeroPromotion(
  input: CreateHeroPromotionInput,
  actorId: string,
  scope: AdminScopeContext,
) {
  const placement = await resolvePlacement(input, scope)
  const endsAt = input.endsAt ?? null
  assertWindow(input.startsAt ?? null, endsAt)
  /* A campaign must end. Checked on CREATE as well as publish, so a draft
   * cannot quietly sit in the table missing the one field that stops it
   * running forever once somebody presses publish. */
  assertPriorityWindow(input.priorityTier ?? "STANDARD", endsAt)
  if (input.endsAt) assertWindowNotElapsed(endsAt)

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

  return presentHeroPromotion(promotion, scope)
}

export async function updateHeroPromotion(
  promotionId: string,
  input: UpdateHeroPromotionInput,
  actorId: string,
  scope: AdminScopeContext,
) {
  const existing = await findPromotionOr404(promotionId)

  /* Moving a promotion between reaches is a scope decision in BOTH places:
   * the caller must hold the OLD reach and the new one.
   *
   * The old-reach check is explicit now. It used to ride on
   * findPromotionOr404's scoped `where`, which stopped being true when reads
   * were opened up to the whole marketing team — without this line, being able
   * to SEE every promotion would have meant being able to EDIT every one. */
  assertPromotionScope(scope, existing.scope as HeroScope, existing)

  const placement = input.scope
    ? await resolvePlacement(
        { scope: input.scope, cityRef: input.cityRef, countryRef: input.countryRef },
        scope,
      )
    : null

  const endsAt = input.endsAt !== undefined ? (input.endsAt ?? null) : existing.endsAt
  assertWindow(
    input.startsAt !== undefined ? (input.startsAt ?? null) : existing.startsAt,
    endsAt,
  )
  /* Against the EFFECTIVE tier: an ordinary draft can be promoted to a
   * campaign by this very call, and that is exactly when the end date starts
   * being required. */
  assertPriorityWindow(input.priorityTier ?? tierForPriority(existing.priority), endsAt)
  if (input.endsAt) assertWindowNotElapsed(endsAt)

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
  if (replacingImage) await discardHeroImage(existing.imageKey)

  serviceLog.info({ actorId, promotionId }, "Hero promotion updated")
  /* Only when the edit changed something a visitor can actually see. Editing a
   * DRAFT changes nothing on the storefront, and purging its cache for every
   * keystroke-level save would push pointless re-renders onto this API. */
  if (promotion.status === HeroPromotionStatus.PUBLISHED) {
    void revalidateStorefront("hero-promotion")
  }
  auditService.log({
    adminUserId: actorId,
    action: "hero_promotion.updated",
    entityType: "HeroPromotion",
    entityId: promotionId,
    changes: { before: { headline: existing.headline }, after: { headline: promotion.headline } },
  })

  return presentHeroPromotion(promotion, scope)
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
  const existing = await findPromotionOr404(promotionId)
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
  const tier = input.priorityTier ?? tierForPriority(existing.priority)

  assertWindow(startsAt, endsAt)
  /* The moment content reaches customers is the last place to catch a campaign
   * with no end date — after this, nothing stops it running. */
  assertPriorityWindow(tier, endsAt)
  /* And publishing something whose window already closed is always a mistake:
   * it can never be seen, but it reads as live in every list. */
  assertWindowNotElapsed(endsAt)

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
      ...(input.priorityTier !== undefined
        ? { priority: priorityForTier(input.priorityTier) }
        : {}),
      updatedByAdminId: actorId,
    },
    select: PROMOTION_SELECT,
  })

  serviceLog.info({ actorId, promotionId }, "Hero promotion published")
  /* The storefront caches its landing page; tell it now rather than leaving the
   * admin to wait out a revalidate window. Never throws — a failed purge does
   * not un-publish anything, it just means the usual timed refresh applies. */
  void revalidateStorefront("hero-promotion")
  auditService.log({
    adminUserId: actorId,
    action: "hero_promotion.published",
    entityType: "HeroPromotion",
    entityId: promotionId,
    changes: { after: { status: promotion.status, startsAt, endsAt } },
  })

  return presentHeroPromotion(promotion, scope)
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
  const existing = await findPromotionOr404(promotionId)
  assertPromotionScope(scope, existing.scope as HeroScope, existing)

  const promotion = await prisma.heroPromotion.update({
    where: { id: promotionId },
    data: { status: HeroPromotionStatus.ARCHIVED, updatedByAdminId: actorId },
    select: PROMOTION_SELECT,
  })

  serviceLog.info({ actorId, promotionId }, "Hero promotion archived")
  /* Withdrawing matters MORE urgently than publishing: until the storefront
   * refreshes it is still showing content somebody decided to pull. */
  void revalidateStorefront("hero-promotion")
  auditService.log({
    adminUserId: actorId,
    action: "hero_promotion.archived",
    entityType: "HeroPromotion",
    entityId: promotionId,
    changes: { before: { status: existing.status }, after: { status: promotion.status } },
  })

  return presentHeroPromotion(promotion, scope)
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
    /* MUST match resolveHeroPromotion's comparison, because of the `take`
     * below: ordering differently here can truncate the true winner away
     * before the pure function ever sees it. */
    orderBy: [{ priority: "desc" }, { scope: "asc" }, { publishedAt: "desc" }],
    take: 25,
    select: PROMOTION_SELECT,
  })

  const winner = resolveHeroPromotion(
    candidates.map((row) => ({ ...row, scope: row.scope as HeroScope })),
    target,
  )

  /* The PUBLIC presenter: this function is the customer storefront's entry
   * point, and it is reached with no authentication at all. */
  return winner ? presentPublicHeroPromotion(winner) : null
}
