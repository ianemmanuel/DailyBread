import { prisma, TaxonomyStatus, GeoStatus, TaxRemitter } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/errors/ApiError"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { assertValidTaxRateBps } from "@/lib/pricing/tax"
import { assertGlobalTaxScope, assertCountryTaxScope } from "../lib/scope"

const serviceLog = logger.child({ module: "finance-tax-service" })

/*
 * Consumption tax: the platform's category vocabulary, what each country
 * charges for each category, and how each country quotes prices.
 *
 * Its own module, not part of finance. Tax is a distinct bounded context that
 * grows in a direction unrelated to payment rails — per-line tax on orders,
 * exemptions, place-of-supply, filing exports, and eventually a TaxProvider
 * adapter interface mirroring PaymentProviderAdapter. It owns its own tables
 * (TaxCategory, CountryTaxRate, CountryTaxConfig) and imports nothing from
 * finance, so it stays extractable on its own.
 *
 * Two levels with deliberately different scope rules, mirroring how every
 * other catalog in this codebase is governed:
 *
 *   CATALOG (TaxCategory)  — global, structural. GLOBAL finance scope only.
 *     Adding "Alcohol" as a distinction the platform can express at all is a
 *     platform decision, not one market's.
 *
 *   RATES (CountryTaxRate) — per country. Own-country finance scope is
 *     enough, city tier is refused (assertCountryTaxScope). A
 *     country's VAT rate is a legal fact its own finance admin records; a
 *     city launch lead must not set policy for the whole country.
 *
 * There is no delete on either. A category a country has rated, or a rate a
 * dish was priced under, is withdrawn by status so history stays readable —
 * the same Restrict-and-suspend rule the cuisine and dietary-tag catalogs use.
 */

// ─── Catalog ──────────────────────────────────────────────────────────────────

const CATEGORY_SELECT = {
  id: true, code: true, slug: true, name: true, description: true,
  status: true, createdAt: true, updatedAt: true,
} as const

/** Reads are open to any finance admin who can reach the config pages: these
 *  are reference data and reveal nothing country-specific. */
export async function listTaxCategories(params: { includeRetired?: boolean } = {}) {
  return prisma.taxCategory.findMany({
    where  : {
      deletedAt: null,
      ...(params.includeRetired ? {} : { status: TaxonomyStatus.ACTIVE }),
    },
    orderBy: [{ name: "asc" }],
    select : {
      ...CATEGORY_SELECT,
      _count: { select: { countryRates: true, menuItems: true } },
    },
  })
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function codify(value: string): string {
  return value.toUpperCase().trim().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "")
}

/** Numeric suffix on collision, the same defensive approach the vendor-type
 *  and food-tag catalogs take: two distinct names can normalize to one slug. */
async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  let candidate = base || "category"
  for (let n = 2; ; n += 1) {
    const clash = await prisma.taxCategory.findFirst({
      where : { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
    if (!clash) return candidate
    candidate = `${base}-${n}`
  }
}

function assertCategoryName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "A tax category needs a name.", "MISSING_FIELDS")
  }
  const name = value.trim()
  if (name.length > 80) {
    throw new ApiError(400, "That name is too long — keep it under 80 characters.", "INVALID_FIELD")
  }
  return name
}

export async function createTaxCategory(
  input  : { name?: unknown; description?: unknown; code?: unknown },
  actorId: string,
  scope  : AdminScopeContext,
) {
  assertGlobalTaxScope(scope)

  const name = assertCategoryName(input.name)
  const code = codify(typeof input.code === "string" && input.code.trim() ? input.code : name)

  const existing = await prisma.taxCategory.findUnique({ where: { code }, select: { id: true } })
  if (existing) {
    throw new ApiError(409, "A tax category with that code already exists.", "DUPLICATE_TAX_CATEGORY")
  }

  const category = await prisma.taxCategory.create({
    data  : {
      code,
      slug            : await ensureUniqueSlug(slugify(name)),
      name,
      description     : typeof input.description === "string" ? input.description.trim() || null : null,
      createdByAdminId: actorId,
    },
    select: CATEGORY_SELECT,
  })

  serviceLog.info({ actorId, taxCategoryId: category.id, code }, "Tax category created")
  auditService.log({
    adminUserId: actorId,
    action     : "tax_category.created",
    entityType : "TaxCategory",
    entityId   : category.id,
    changes    : { after: { code, name } },
  })
  return category
}

export async function updateTaxCategory(
  categoryId: string,
  input     : { name?: unknown; description?: unknown },
  actorId   : string,
  scope     : AdminScopeContext,
) {
  assertGlobalTaxScope(scope)

  const existing = await prisma.taxCategory.findFirst({
    where : { id: categoryId, deletedAt: null },
    select: { id: true, name: true, description: true },
  })
  if (!existing) throw new ApiError(404, "Tax category not found", "NOT_FOUND")

  const name = assertCategoryName(input.name)
  const description = typeof input.description === "string" ? input.description.trim() || null : null

  const updated = await prisma.taxCategory.update({
    where : { id: categoryId },
    // `code` is deliberately immutable: it is what seeds and any future
    // integration key on, so a rename must not move it.
    data  : { name, description, slug: await ensureUniqueSlug(slugify(name), categoryId) },
    select: CATEGORY_SELECT,
  })

  auditService.log({
    adminUserId: actorId,
    action     : "tax_category.updated",
    entityType : "TaxCategory",
    entityId   : categoryId,
    changes    : {
      before: { name: existing.name, description: existing.description },
      after : { name, description },
    },
  })
  return updated
}

/**
 * Withdraw or restore a category platform-wide.
 *
 * Suspending does NOT retract the rates countries have already set against it,
 * and does not reprice a dish that names it — those stay valid and visible.
 * What it stops is the category being offered to anyone new, which is exactly
 * what suspension means in the cuisine and vendor-type catalogs.
 */
export async function setTaxCategoryStatus(
  categoryId: string,
  status    : TaxonomyStatus,
  actorId   : string,
  scope     : AdminScopeContext,
) {
  assertGlobalTaxScope(scope)

  const existing = await prisma.taxCategory.findFirst({
    where : { id: categoryId, deletedAt: null },
    select: {
      id: true, status: true, code: true,
      _count: { select: { menuItems: true, countryRates: true } },
    },
  })
  if (!existing) throw new ApiError(404, "Tax category not found", "NOT_FOUND")
  if (existing.status === status) return { id: categoryId, status, changed: false }

  await prisma.taxCategory.update({ where: { id: categoryId }, data: { status } })

  serviceLog.info(
    { actorId, taxCategoryId: categoryId, status, affectedMeals: existing._count.menuItems },
    "Tax category status changed",
  )
  auditService.log({
    adminUserId: actorId,
    action     : "tax_category.status_changed",
    entityType : "TaxCategory",
    entityId   : categoryId,
    changes    : { before: { status: existing.status }, after: { status } },
    metadata   : {
      code            : existing.code,
      ratedByCountries: existing._count.countryRates,
      mealsUsing      : existing._count.menuItems,
    },
  })
  return { id: categoryId, status, changed: true }
}

// ─── Per-country settings and rates ──────────────────────────────────────────

const RATE_SELECT = {
  id: true, rateBps: true, isStandard: true, status: true, createdAt: true, updatedAt: true,
  taxCategory: { select: { id: true, code: true, name: true, status: true } },
} as const

/**
 * Everything one country's tax position consists of: how prices are quoted,
 * who remits, what the tax is called here, and every rate on the books.
 */
export async function getCountryTaxSettings(countryId: string, scope: AdminScopeContext) {
  assertCountryTaxScope(scope, countryId)

  const [config, rates] = await Promise.all([
    prisma.countryTaxConfig.findUnique({
      where : { countryId },
      select: { pricesIncludeTax: true, taxRemittedBy: true, taxName: true },
    }),
    prisma.countryTaxRate.findMany({
      where  : { countryId },
      orderBy: [{ isStandard: "desc" }, { taxCategory: { name: "asc" } }],
      select : RATE_SELECT,
    }),
  ])

  return {
    // A country with no financial config row yet reads as the defaults rather
    // than as an error: "nothing configured" is the honest answer, and the
    // admin page has to render in order to configure it.
    pricesIncludeTax: config?.pricesIncludeTax ?? true,
    taxRemittedBy   : config?.taxRemittedBy ?? TaxRemitter.VENDOR,
    taxName         : config?.taxName ?? null,
    configExists    : config != null,
    rates,
    hasStandardRate : rates.some((r) => r.isStandard && r.status === GeoStatus.ACTIVE),
  }
}

export interface SetCountryTaxSettingsInput {
  pricesIncludeTax?: unknown
  taxRemittedBy   ?: unknown
  taxName         ?: unknown
}

export async function setCountryTaxSettings(
  countryId: string,
  input    : SetCountryTaxSettingsInput,
  actorId  : string,
  scope    : AdminScopeContext,
) {
  assertCountryTaxScope(scope, countryId)

  const config = await prisma.countryTaxConfig.findUnique({
    where : { countryId },
    select: { pricesIncludeTax: true, taxRemittedBy: true, taxName: true },
  })

  if (typeof input.pricesIncludeTax !== "boolean") {
    throw new ApiError(400, "pricesIncludeTax must be true or false", "INVALID_FIELD")
  }
  if (input.taxRemittedBy !== TaxRemitter.VENDOR && input.taxRemittedBy !== TaxRemitter.PLATFORM) {
    throw new ApiError(400, "taxRemittedBy must be VENDOR or PLATFORM", "INVALID_FIELD")
  }
  const taxName =
    typeof input.taxName === "string" && input.taxName.trim()
      ? input.taxName.trim().slice(0, 40)
      : null

  const after = {
    pricesIncludeTax: input.pricesIncludeTax,
    taxRemittedBy   : input.taxRemittedBy,
    taxName,
  }

  // Upsert, not update: a country has no tax row until someone states its
  // position, and stating it IS the act of creating the row. Requiring a
  // separate "create the config first" step would be ceremony with no
  // decision behind it.
  await prisma.countryTaxConfig.upsert({
    where : { countryId },
    update: after,
    create: { countryId, ...after, createdByAdminId: actorId },
  })

  serviceLog.info({ actorId, countryId, ...after }, "Country tax settings changed")
  auditService.log({
    adminUserId: actorId,
    action     : config ? "country_tax_settings.updated" : "country_tax_settings.created",
    entityType : "CountryTaxConfig",
    entityId   : countryId,
    changes    : { before: config ?? undefined, after },
    metadata   : { countryId },
  })
  return getCountryTaxSettings(countryId, scope)
}

export interface UpsertCountryTaxRateInput {
  taxCategoryId?: unknown
  rateBps      ?: unknown
  isStandard   ?: unknown
}

/**
 * Records what this country charges for one category.
 *
 * Promoting a rate to standard demotes the previous one in the same
 * transaction. The database also holds a partial unique index over
 * (countryId) where isStandard and ACTIVE, so two standards cannot coexist
 * even if a future caller forgets — the fallback decides the price of every
 * dish that names no category, so which row wins must never be ambiguous.
 */
export async function upsertCountryTaxRate(
  countryId: string,
  input    : UpsertCountryTaxRateInput,
  actorId  : string,
  scope    : AdminScopeContext,
) {
  assertCountryTaxScope(scope, countryId)

  if (typeof input.taxCategoryId !== "string" || !input.taxCategoryId) {
    throw new ApiError(400, "Choose a tax category.", "MISSING_FIELDS")
  }

  let rateBps: number
  try {
    rateBps = assertValidTaxRateBps(input.rateBps)
  } catch {
    throw new ApiError(
      400,
      "A tax rate must be a whole number of basis points between 0 and 10000.",
      "INVALID_TAX_RATE",
    )
  }

  const category = await prisma.taxCategory.findFirst({
    where : { id: input.taxCategoryId, deletedAt: null },
    select: { id: true, status: true, name: true },
  })
  if (!category) throw new ApiError(404, "That tax category doesn't exist", "NOT_FOUND")

  const alreadyRated = await prisma.countryTaxRate.findUnique({
    where : { countryId_taxCategoryId: { countryId, taxCategoryId: category.id } },
    select: { id: true, rateBps: true, isStandard: true, status: true },
  })
  // A country may keep a rate it already holds on a withdrawn category, but
  // must not newly adopt one — the same rule per-country food-tag
  // availability follows.
  if (!alreadyRated && category.status !== TaxonomyStatus.ACTIVE) {
    throw new ApiError(
      409,
      "That tax category is suspended platform-wide and can't be adopted.",
      "TAX_CATEGORY_SUSPENDED",
    )
  }

  const isStandard = input.isStandard === true

  const rate = await prisma.$transaction(async (tx) => {
    if (isStandard) {
      await tx.countryTaxRate.updateMany({
        where: {
          countryId,
          isStandard: true,
          ...(alreadyRated ? { id: { not: alreadyRated.id } } : {}),
        },
        data : { isStandard: false },
      })
    }

    return tx.countryTaxRate.upsert({
      where : { countryId_taxCategoryId: { countryId, taxCategoryId: category.id } },
      update: { rateBps, isStandard, status: GeoStatus.ACTIVE },
      create: { countryId, taxCategoryId: category.id, rateBps, isStandard, createdByAdminId: actorId },
      select: RATE_SELECT,
    })
  })

  serviceLog.info(
    { actorId, countryId, taxCategoryId: category.id, rateBps, isStandard },
    "Country tax rate set",
  )
  auditService.log({
    adminUserId: actorId,
    action     : alreadyRated ? "country_tax_rate.updated" : "country_tax_rate.created",
    entityType : "CountryTaxRate",
    entityId   : rate.id,
    changes    : {
      before: alreadyRated ? { rateBps: alreadyRated.rateBps, isStandard: alreadyRated.isStandard } : undefined,
      after : { rateBps, isStandard },
    },
    metadata   : { countryId, taxCategory: category.name },
  })
  return rate
}

/**
 * Retires or restores one of a country's rates.
 *
 * A retired standard rate also loses its standard flag: leaving it set would
 * hold the partial unique index against a row that no longer applies, and the
 * country could then never nominate a replacement.
 */
export async function setCountryTaxRateStatus(
  countryId: string,
  rateId   : string,
  status   : GeoStatus,
  actorId  : string,
  scope    : AdminScopeContext,
) {
  assertCountryTaxScope(scope, countryId)

  const existing = await prisma.countryTaxRate.findFirst({
    where : { id: rateId, countryId },
    select: { id: true, status: true, isStandard: true, taxCategory: { select: { name: true } } },
  })
  if (!existing) throw new ApiError(404, "Tax rate not found", "NOT_FOUND")
  if (existing.status === status) return { id: rateId, status, changed: false }

  await prisma.countryTaxRate.update({
    where: { id: rateId },
    data : { status, ...(status === GeoStatus.INACTIVE ? { isStandard: false } : {}) },
  })

  serviceLog.info({ actorId, countryId, rateId, status }, "Country tax rate status changed")
  auditService.log({
    adminUserId: actorId,
    action     : "country_tax_rate.status_changed",
    entityType : "CountryTaxRate",
    entityId   : rateId,
    changes    : { before: { status: existing.status }, after: { status } },
    metadata   : { countryId, taxCategory: existing.taxCategory.name },
  })
  return { id: rateId, status, changed: true }
}

// ─── Resolution, for pricing ─────────────────────────────────────────────────

export interface CountryTaxProfile {
  pricesIncludeTax: boolean
  taxRemittedBy   : TaxRemitter
  /** What this market calls it. Null falls back to a generic label. */
  taxName         : string | null
  /** The fallback rate for a dish naming no category. Null when the country
   *  has not set one, which honestly means tax cannot be computed here yet. */
  standardRateBps : number | null
  /** Every ACTIVE rate, keyed by tax-category id. */
  ratesByCategory : Record<string, number>
}

/**
 * The read the pricing path needs. No scope argument: this is resolution for a
 * vendor or a customer acting inside their own country, not an admin browsing
 * someone else's, and the caller has already established which country applies.
 */
export async function getCountryTaxProfile(countryId: string): Promise<CountryTaxProfile> {
  const [config, rates] = await Promise.all([
    prisma.countryTaxConfig.findUnique({
      where : { countryId },
      select: { pricesIncludeTax: true, taxRemittedBy: true, taxName: true },
    }),
    prisma.countryTaxRate.findMany({
      where : { countryId, status: GeoStatus.ACTIVE },
      select: { taxCategoryId: true, rateBps: true, isStandard: true },
    }),
  ])

  const ratesByCategory: Record<string, number> = {}
  let standardRateBps: number | null = null
  for (const rate of rates) {
    ratesByCategory[rate.taxCategoryId] = rate.rateBps
    if (rate.isStandard) standardRateBps = rate.rateBps
  }

  return {
    pricesIncludeTax: config?.pricesIncludeTax ?? true,
    taxRemittedBy   : config?.taxRemittedBy ?? TaxRemitter.VENDOR,
    taxName         : config?.taxName ?? null,
    standardRateBps,
    ratesByCategory,
  }
}

/**
 * Which rate one dish attracts. A dish naming no category takes the country's
 * standard rate; a dish naming a category the country has NOT rated also takes
 * the standard rate rather than zero, because an unrated category is a gap in
 * configuration and quietly charging nothing would be the expensive reading.
 */
export function resolveRateBps(
  profile      : CountryTaxProfile,
  taxCategoryId: string | null,
): number | null {
  if (taxCategoryId && taxCategoryId in profile.ratesByCategory) {
    return profile.ratesByCategory[taxCategoryId]!
  }
  return profile.standardRateBps
}
