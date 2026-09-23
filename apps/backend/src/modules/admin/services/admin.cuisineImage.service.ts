import { prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"

import { UUID_RE } from "@/constants/system"
import { ApiError } from "@/errors/ApiError"
import {
  discardPublicImage,
  presignOriginalUpload,
  processPublicSquareImage,
} from "@/lib/images/publicImage"
import { publicMediaStorage } from "@/lib/storage/publicMedia.storage"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import {
  CUISINE_CROP,
  CUISINE_ORIGINAL_PREFIX,
  CUISINE_PUBLIC_PREFIX,
} from "../lib/cuisineImage.rules"

/*
 * Cuisine imagery.
 *
 * ── Why this is its own service, beside admin.foodTag.service.ts ───────────
 *
 * That file is written ONCE and dispatched across Cuisine and DietaryTag,
 * which are column-for-column identical. Imagery is the one thing that is NOT
 * shared: a cuisine tile is a photograph, a dietary tag is a badge. Threading
 * an optional image through the generic delegate would put dead branches in
 * every dietary-tag call and make the shared file lie about what it covers.
 *
 * So the generic catalog operations stay generic, and this narrow file owns
 * the part that only applies to cuisines.
 *
 * ── The pipeline is the shared one ─────────────────────────────────────────
 *
 * Upload → private bucket → re-encode → public bucket, exactly as the hero
 * does, through `lib/images/publicImage.ts`. RE-ENCODING IS THE SANITISER:
 * nothing an admin uploaded reaches the public bucket byte for byte. The only
 * things that differ are the prefixes and the crop.
 */

const serviceLog = logger.child({ module: "admin-cuisine-image-service" })

/** Catalog imagery is global content, so writing it needs GLOBAL scope — the
 *  same rule the catalog's name and description already follow. A country lead
 *  curates which cuisines their market offers; they do not re-photograph the
 *  platform's vocabulary. */
function assertGlobalScope(scope: AdminScopeContext): void {
  if (!scope.isGlobal) {
    throw new ApiError(
      403,
      "Only a global admin can change catalog imagery.",
      "SCOPE_FORBIDDEN",
    )
  }
}

const CUISINE_SELECT = {
  id: true, code: true, slug: true, name: true, description: true, status: true,
  imageKey: true, originalImageKey: true, imageWidth: true, imageHeight: true,
  imageBlurDataUrl: true, imageAlt: true,
  createdAt: true, updatedAt: true,
} as const

type CuisineRow = {
  id: string; code: string; slug: string; name: string
  description: string | null; status: string
  imageKey: string | null; originalImageKey: string | null
  imageWidth: number | null; imageHeight: number | null
  imageBlurDataUrl: string | null; imageAlt: string | null
  createdAt: Date; updatedAt: Date
}

/**
 * The wire shape. `imageKey` never leaves — a key is an internal address, and
 * the URL is built in exactly one place so the storage provider stays
 * replaceable (nothing persists a URL).
 *
 * Degrades rather than throws when the public bucket is unconfigured: a read
 * crashing over a deployment concern is far worse than a missing picture.
 */
export function presentCuisine(row: CuisineRow) {
  const { imageKey, originalImageKey, imageWidth, imageHeight, imageBlurDataUrl, ...rest } = row

  if (imageKey && !publicMediaStorage.isConfigured()) {
    serviceLog.warn(
      { cuisineId: row.id },
      "A cuisine has an image but public media storage is unconfigured — serving it without one",
    )
  }

  return {
    ...rest,
    /* Kept so the ERP can tell "no image" from "image we cannot currently
     * serve", and so a re-crop knows there is an original to work from. */
    hasImage: Boolean(imageKey),
    hasOriginal: Boolean(originalImageKey),
    image:
      imageKey && publicMediaStorage.isConfigured()
        ? {
            url: publicMediaStorage.publicUrl(imageKey),
            width: imageWidth,
            height: imageHeight,
            blurDataUrl: imageBlurDataUrl,
            alt: row.imageAlt,
          }
        : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function findCuisineOr404(idOrSlug: string): Promise<CuisineRow> {
  const row = await prisma.cuisine.findFirst({
    where : UUID_RE.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug },
    select: CUISINE_SELECT,
  })
  if (!row) throw new ApiError(404, "Cuisine not found", "NOT_FOUND")
  return row as CuisineRow
}

/**
 * One cuisine, with its imagery and the countries that have switched it on.
 *
 * Reading is NOT scope-filtered. A cuisine is platform vocabulary that every
 * vendor and customer can already see; a country lead who cannot see the
 * catalog cannot curate their market from it. Writing stays global-only.
 */
export async function getCuisineDetail(idOrSlug: string) {
  const row = await findCuisineOr404(idOrSlug)

  /* How many vendor profiles already carry this cuisine. It is what makes
   * suspending a real decision rather than a shrug, so the confirmation can
   * say "these 12 keep it" instead of asking an admin to guess. */
  const vendorCount = await prisma.vendorProfileCuisine.count({
    where: { cuisineId: row.id },
  })

  const countries = await prisma.cuisineCountry.findMany({
    where : { cuisineId: row.id, status: "ACTIVE" },
    select: { country: { select: { id: true, name: true, slug: true, code: true } } },
    orderBy: { country: { name: "asc" } },
  })

  return {
    ...presentCuisine(row),
    vendorCount,
    countries: countries.map((link) => link.country),
  }
}

/** A presigned PUT for the admin's ORIGINAL, into the PRIVATE bucket. The
 *  browser uploads straight to storage; the file never passes through here. */
export async function presignCuisineImageUpload(
  contentType: string,
  scope: AdminScopeContext,
) {
  assertGlobalScope(scope)
  return presignOriginalUpload({ prefix: CUISINE_ORIGINAL_PREFIX, contentType })
}

/**
 * Publish a new image for a cuisine, replacing whatever it had.
 *
 * The OLD public object is deleted only AFTER the row points at the new one,
 * and best-effort: an orphaned object costs pennies, while deleting first and
 * then failing the write would leave a cuisine whose image 404s.
 */
export async function setCuisineImage(
  idOrSlug: string,
  input   : { originalImageKey: string; imageAlt?: string | null },
  actorId : string,
  scope   : AdminScopeContext,
) {
  assertGlobalScope(scope)
  const existing = await findCuisineOr404(idOrSlug)

  const imagery = await processPublicSquareImage({
    originalKey   : input.originalImageKey,
    originalPrefix: CUISINE_ORIGINAL_PREFIX,
    publicPrefix  : CUISINE_PUBLIC_PREFIX,
    crop          : CUISINE_CROP,
  })

  const updated = await prisma.cuisine.update({
    where: { id: existing.id },
    data : {
      imageKey        : imagery.imageKey,
      originalImageKey: imagery.originalImageKey,
      imageWidth      : imagery.imageWidth,
      imageHeight     : imagery.imageHeight,
      imageBlurDataUrl: imagery.imageBlurDataUrl,
      ...(input.imageAlt !== undefined ? { imageAlt: input.imageAlt?.trim() || null } : {}),
    },
    select: CUISINE_SELECT,
  })

  if (existing.imageKey && existing.imageKey !== imagery.imageKey) {
    await discardPublicImage(existing.imageKey, "cuisine")
  }

  auditService.log({
    adminUserId: actorId,
    action     : "cuisine.image.updated",
    entityType : "Cuisine",
    entityId   : existing.id,
    changes    : { after: { imageKey: imagery.imageKey } },
  })

  return presentCuisine(updated as CuisineRow)
}

/** Update only the alt text, without re-processing the picture. */
export async function updateCuisineImageAlt(
  idOrSlug: string,
  imageAlt: string | null,
  actorId : string,
  scope   : AdminScopeContext,
) {
  assertGlobalScope(scope)
  const existing = await findCuisineOr404(idOrSlug)

  const updated = await prisma.cuisine.update({
    where : { id: existing.id },
    data  : { imageAlt: imageAlt?.trim() || null },
    select: CUISINE_SELECT,
  })

  auditService.log({
    adminUserId: actorId,
    action     : "cuisine.image.alt-updated",
    entityType : "Cuisine",
    entityId   : existing.id,
    changes    : { before: { imageAlt: existing.imageAlt }, after: { imageAlt: updated.imageAlt } },
  })

  return presentCuisine(updated as CuisineRow)
}

/** Remove a cuisine's image. The storefront falls back to a plain tile. */
export async function removeCuisineImage(
  idOrSlug: string,
  actorId : string,
  scope   : AdminScopeContext,
) {
  assertGlobalScope(scope)
  const existing = await findCuisineOr404(idOrSlug)

  if (!existing.imageKey) return presentCuisine(existing)

  const updated = await prisma.cuisine.update({
    where : { id: existing.id },
    data  : {
      imageKey        : null,
      originalImageKey: null,
      imageWidth      : null,
      imageHeight     : null,
      imageBlurDataUrl: null,
      imageAlt        : null,
    },
    select: CUISINE_SELECT,
  })

  await discardPublicImage(existing.imageKey, "cuisine")

  auditService.log({
    adminUserId: actorId,
    action     : "cuisine.image.removed",
    entityType : "Cuisine",
    entityId   : existing.id,
    changes    : { before: { imageKey: existing.imageKey } },
  })

  return presentCuisine(updated as CuisineRow)
}
