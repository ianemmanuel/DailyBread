import { z } from "zod"

import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/images/transform"

/*
 * Every schema is `.strict()`, so an unknown key is rejected rather than
 * ignored. That is the schema-level half of "controllers destructure field by
 * field, never spread" — between the two, a client cannot set `status`,
 * `publishedAt`, `imageKey` or any other field the server owns.
 *
 * The derived image fields (imageKey, width, height, blurDataUrl) are ABSENT
 * from every write schema on purpose. The server produces them from the
 * original it processed; a client that could supply them could point a
 * promotion at any object in the bucket, or lie about its dimensions and break
 * the layout.
 */

const HERO_SCOPE = z.enum(["CITY", "COUNTRY", "GLOBAL"])

/** A relative path inside the storefront. An absolute URL is refused: a
 *  promotion is platform-authored, and an off-site link in it would be an open
 *  redirect wearing our branding. */
const ctaHref = z
  .string()
  .max(300)
  .regex(/^\/[^\s]*$/, "The link must be a path inside the storefront, e.g. /meal-plans")

const copy = {
  eyebrow: z.string().trim().max(60).nullish(),
  headline: z.string().trim().min(1).max(120),
  subheadline: z.string().trim().max(240).nullish(),
  ctaLabel: z.string().trim().max(40).nullish(),
  ctaHref: ctaHref.nullish(),
}

const placement = {
  scope: HERO_SCOPE,
  /* Accepted as a UUID or a slug and resolved server-side, the same as every
   * other admin endpoint that takes a country or city reference. */
  cityRef: z.string().trim().min(1).nullish(),
  countryRef: z.string().trim().min(1).nullish(),
}

const scheduling = {
  priority: z.number().int().min(0).max(1000).optional(),
  startsAt: z.coerce.date().nullish(),
  endsAt: z.coerce.date().nullish(),
}

const imagery = {
  /* The PRIVATE key of the original the admin just uploaded. The service
   * verifies the prefix, fetches it, re-encodes it and fills in every derived
   * field itself. */
  originalImageKey: z.string().trim().min(1).nullish(),
  imageAlt: z.string().trim().max(200).nullish(),
}

export const createHeroPromotionSchema = z
  .object({ ...placement, ...copy, ...scheduling, ...imagery })
  .strict()

export const updateHeroPromotionSchema = z
  .object({
    ...placement,
    ...copy,
    ...scheduling,
    ...imagery,
    scope: HERO_SCOPE.optional(),
    headline: copy.headline.optional(),
  })
  .strict()

export const listHeroPromotionsSchema = z
  .object({
    scope: HERO_SCOPE.optional(),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
    cityRef: z.string().trim().min(1).optional(),
    countryRef: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()

export const presignHeroImageSchema = z
  .object({
    contentType: z.enum(ALLOWED_UPLOAD_MIME_TYPES),
    fileSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  })
  .strict()

/** Publishing is its own endpoint and its own permission, because it is the
 *  moment content becomes visible to customers. */
export const publishHeroPromotionSchema = z
  .object({ ...scheduling })
  .strict()

export type CreateHeroPromotionInput = z.infer<typeof createHeroPromotionSchema>
export type UpdateHeroPromotionInput = z.infer<typeof updateHeroPromotionSchema>
export type ListHeroPromotionsInput = z.infer<typeof listHeroPromotionsSchema>
export type PresignHeroImageInput = z.infer<typeof presignHeroImageSchema>
export type PublishHeroPromotionInput = z.infer<typeof publishHeroPromotionSchema>
