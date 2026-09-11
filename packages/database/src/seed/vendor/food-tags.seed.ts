import { prisma } from '../../index'
import { CUISINES, DIETARY_TAGS } from './data/food-tags.data'

/*
 * Idempotent. Keyed on `code`, which is the stable identifier — `name` and
 * `slug` are both admin-editable, so keying on either would create duplicates
 * the first time someone renames an entry.
 *
 * `status` is deliberately left untouched on update, same reasoning as
 * vendor-types.seed.ts and countries.seed.ts: re-running the seed must never
 * silently re-activate an entry an admin deliberately suspended.
 *
 * Per-country availability (CuisineCountry / DietaryTagCountry) is NOT seeded
 * — every country starts with nothing switched on, which is what makes the
 * per-country enablement screen a real decision rather than a formality.
 */
export async function seedFoodTags(): Promise<{ cuisines: number; dietaryTags: number }> {
  for (const cuisine of CUISINES) {
    await prisma.cuisine.upsert({
      where : { code: cuisine.code },
      update: { name: cuisine.name, slug: cuisine.slug, description: cuisine.description },
      create: { code: cuisine.code, name: cuisine.name, slug: cuisine.slug, description: cuisine.description },
    })
  }

  for (const tag of DIETARY_TAGS) {
    await prisma.dietaryTag.upsert({
      where : { code: tag.code },
      update: { name: tag.name, slug: tag.slug, description: tag.description },
      create: { code: tag.code, name: tag.name, slug: tag.slug, description: tag.description },
    })
  }

  return { cuisines: CUISINES.length, dietaryTags: DIETARY_TAGS.length }
}
