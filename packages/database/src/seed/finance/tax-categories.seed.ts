import { prisma } from '../../index'
import { TAX_CATEGORIES } from './data/tax-categories.data'

/*
 * Idempotent — `status` is deliberately left untouched on update, the same
 * rule payment-methods.seed.ts and vendor-types.seed.ts follow: re-running the
 * seed must never silently reactivate a category an admin withdrew.
 *
 * No CountryTaxRate rows are created. Which categories a market charges, and
 * at what rate, is a legal fact and a deliberate admin action — the same
 * "seed the global catalog, per-country activation stays an admin decision"
 * convention used for payment methods, cuisines and vendor types.
 */
export async function seedTaxCategories(): Promise<number> {
  for (const category of TAX_CATEGORIES) {
    await prisma.taxCategory.upsert({
      where : { code: category.code },
      update: { slug: category.slug, name: category.name, description: category.description },
      create: {
        code       : category.code,
        slug       : category.slug,
        name       : category.name,
        description: category.description,
      },
    })
  }

  return TAX_CATEGORIES.length
}
