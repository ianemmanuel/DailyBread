import { prisma, GeoStatus, TaxonomyStatus } from "@repo/db"
import { ApiError } from "@/middleware/error"
import type { VendorFoodTag, VendorFoodTagOptions } from "@repo/types/backend"

/*
 * The cuisines and dietary tags one vendor may pick from.
 *
 * "May pick from" is the whole point: an entry has to be ACTIVE in the global
 * catalog AND switched on for the vendor's own country. A country team curates
 * their market (admin.foodTag.service.ts), and this is the read that makes
 * that curation real on the vendor's side.
 *
 * Reads prisma directly rather than calling the admin service — the vendor
 * module never imports the admin module (same rule as
 * notifyAdminsProfileFlagged living in lib/moderation).
 */

const AVAILABLE_SELECT = { id: true, slug: true, name: true, description: true } as const

/** How many tags a vendor may claim. A profile that claims twelve cuisines is
 *  telling a customer nothing; the cap keeps the tag list a real signal. */
export const MAX_CUISINES_PER_PROFILE     = 5
export const MAX_DIETARY_TAGS_PER_PROFILE = 8

export async function getVendorFoodTagOptions(countryId: string): Promise<VendorFoodTagOptions> {
  const [cuisines, dietaryTags] = await Promise.all([
    prisma.cuisine.findMany({
      where  : {
        deletedAt: null,
        status   : TaxonomyStatus.ACTIVE,
        countries: { some: { countryId, status: GeoStatus.ACTIVE } },
      },
      orderBy: { name: "asc" },
      select : AVAILABLE_SELECT,
    }),
    prisma.dietaryTag.findMany({
      where  : {
        deletedAt: null,
        status   : TaxonomyStatus.ACTIVE,
        countries: { some: { countryId, status: GeoStatus.ACTIVE } },
      },
      orderBy: { name: "asc" },
      select : AVAILABLE_SELECT,
    }),
  ])

  return {
    cuisines   : cuisines as VendorFoodTag[],
    dietaryTags: dietaryTags as VendorFoodTag[],
    maxCuisines   : MAX_CUISINES_PER_PROFILE,
    maxDietaryTags: MAX_DIETARY_TAGS_PER_PROFILE,
  }
}

export interface SelectedFoodTags {
  cuisineIds   : string[]
  dietaryTagIds: string[]
}

/**
 * Validates what the vendor submitted against what their country actually
 * offers, and returns the de-duplicated ids to write.
 *
 * The frontend only ever renders enabled options, so a mismatch here means
 * either a stale page (an admin disabled the tag mid-edit) or a hand-crafted
 * request. Both get the same specific error rather than a silent drop — a
 * vendor who ticked something and saw it vanish without explanation would
 * reasonably assume the save was broken.
 */
export async function resolveSelectedFoodTags(
  countryId: string,
  input    : { cuisineIds?: unknown; dietaryTagIds?: unknown },
  /* Caps default to the profile's. A meal is tagged more tightly than a whole
   * business is, so the menu passes its own — the availability rule below is
   * identical either way, which is why this is a parameter and not a copy. */
  caps     : { maxCuisines?: number; maxDietaryTags?: number } = {},
): Promise<SelectedFoodTags> {
  const maxCuisines    = caps.maxCuisines    ?? MAX_CUISINES_PER_PROFILE
  const maxDietaryTags = caps.maxDietaryTags ?? MAX_DIETARY_TAGS_PER_PROFILE

  const cuisineIds    = normalizeIds(input.cuisineIds, maxCuisines, "cuisine")
  const dietaryTagIds = normalizeIds(input.dietaryTagIds, maxDietaryTags, "dietary tag")

  if (cuisineIds.length === 0 && dietaryTagIds.length === 0) {
    return { cuisineIds: [], dietaryTagIds: [] }
  }

  const options = await getVendorFoodTagOptions(countryId)
  assertAllAvailable(cuisineIds, options.cuisines, "cuisine")
  assertAllAvailable(dietaryTagIds, options.dietaryTags, "dietary tag")

  return { cuisineIds, dietaryTagIds }
}

function normalizeIds(value: unknown, max: number, label: string): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw new ApiError(400, `Selected ${label}s must be a list`, "INVALID_SELECTION")
  }
  const ids = [...new Set(value.filter((v): v is string => typeof v === "string" && v.length > 0))]
  if (ids.length > max) {
    throw new ApiError(400, `You can select up to ${max} ${label}s.`, "TOO_MANY_SELECTED")
  }
  return ids
}

function assertAllAvailable(ids: string[], available: VendorFoodTag[], label: string): void {
  if (ids.length === 0) return
  const allowed = new Set(available.map((t) => t.id))
  const unknown = ids.filter((id) => !allowed.has(id))
  if (unknown.length > 0) {
    throw new ApiError(
      400,
      `One of the ${label}s you selected is no longer available in your country. Reload the page and try again.`,
      "TAG_NOT_AVAILABLE",
    )
  }
}
