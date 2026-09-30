import { prisma, GeoStatus, TaxonomyStatus } from "@repo/db"
import { ApiError } from "@/middleware/error"
import type { VendorFoodTag } from "@repo/types/backend"

/*
 * The cuisines and dietary tags a vendor in one country may pick from, and the
 * validation of a selection against them.
 *
 * "May pick from" is the whole point: an entry has to be ACTIVE in the global
 * catalog AND switched on for the vendor's own country. A country team curates
 * their market (admin.foodTag.service.ts), and this is the read that makes
 * that curation real on the vendor's side.
 *
 * In lib/ because two owners tag with it — a vendor PROFILE (vendor module) and
 * a DISH (meals module) — and neither may import the other. The availability
 * rule is shared; the CAPS are not, so every caller passes its own.
 *
 * Reads prisma directly rather than calling the admin service — neither
 * consumer may import the admin module (same rule as notifyAdminsProfileFlagged
 * living in lib/moderation).
 */

const AVAILABLE_SELECT = { id: true, slug: true, name: true, description: true } as const

export interface AvailableFoodTags {
  cuisines   : VendorFoodTag[]
  dietaryTags: VendorFoodTag[]
}

export async function getAvailableFoodTags(countryId: string): Promise<AvailableFoodTags> {
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
  /* Each owner's own. A meal is tagged more tightly than a whole business is,
   * so the menu passes tighter caps than the profile — the availability rule
   * below is identical either way, which is why this is a parameter and not a
   * copy. */
  caps     : { maxCuisines: number; maxDietaryTags: number },
): Promise<SelectedFoodTags> {
  const cuisineIds    = normalizeIds(input.cuisineIds, caps.maxCuisines, "cuisine")
  const dietaryTagIds = normalizeIds(input.dietaryTagIds, caps.maxDietaryTags, "dietary tag")

  if (cuisineIds.length === 0 && dietaryTagIds.length === 0) {
    return { cuisineIds: [], dietaryTagIds: [] }
  }

  const options = await getAvailableFoodTags(countryId)
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
