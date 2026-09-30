import type { VendorFoodTagOptions } from "@repo/types/backend"
import {
  getAvailableFoodTags, resolveSelectedFoodTags, type SelectedFoodTags,
} from "@/lib/catalog/foodTags"

/*
 * Food tags on a vendor PROFILE.
 *
 * The catalog read and the availability rule are shared with dishes and live
 * in lib/catalog/foodTags.ts. What is profile-specific stays here: how many
 * tags a whole business may claim, and the options shape the profile form
 * reads.
 */

/** How many tags a vendor may claim. A profile that claims twelve cuisines is
 *  telling a customer nothing; the cap keeps the tag list a real signal. */
export const MAX_CUISINES_PER_PROFILE     = 5
export const MAX_DIETARY_TAGS_PER_PROFILE = 8

export async function getVendorFoodTagOptions(countryId: string): Promise<VendorFoodTagOptions> {
  return {
    ...await getAvailableFoodTags(countryId),
    maxCuisines   : MAX_CUISINES_PER_PROFILE,
    maxDietaryTags: MAX_DIETARY_TAGS_PER_PROFILE,
  }
}

/** A profile's tag selection, validated at the profile's caps. */
export function resolveProfileFoodTags(
  countryId: string,
  input    : { cuisineIds?: unknown; dietaryTagIds?: unknown },
): Promise<SelectedFoodTags> {
  return resolveSelectedFoodTags(countryId, input, {
    maxCuisines   : MAX_CUISINES_PER_PROFILE,
    maxDietaryTags: MAX_DIETARY_TAGS_PER_PROFILE,
  })
}
