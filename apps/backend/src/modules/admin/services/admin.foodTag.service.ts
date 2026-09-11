import { prisma, GeoStatus, TaxonomyStatus } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/middleware/error"
import { UUID_RE } from "@/constants/system"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"

/*
 * The food taxonomy a vendor picks from: cuisines (what kind of food) and
 * dietary tags (which diets they cater for).
 *
 * Both follow the VendorType / VendorTypeCountry shape exactly — a global
 * catalog plus a per-country table saying which entries a market has switched
 * on — and the split is enforced by scope, not by permission:
 *
 *   creating / editing / suspending a catalog entry → GLOBAL scope only
 *   switching an entry on or off for a country      → that country in scope
 *
 * One permission (`settings:food_tags:write`) therefore gives an
 * operations_admin (GLOBAL-only) catalog control and a vendor_ops admin
 * (COUNTRY/CITY-only) curation of their own market, with no way for the latter
 * to invent global vocabulary. That is the whole reason this is a controlled
 * vocabulary rather than free text: it can be aggregated across vendors and
 * filtered on by customers.
 */

const serviceLog = logger.child({ module: "admin-food-tag-service" })

export type FoodTagKind = "CUISINE" | "DIETARY_TAG"

/*
 * Cuisine and DietaryTag are column-for-column identical (see schema.prisma's
 * FOOD TAXONOMY block), so every operation in this file is written once and
 * dispatched through this table. Prisma generates a distinct delegate type per
 * model and TypeScript cannot prove two structurally identical delegates are
 * interchangeable, so the pairing is asserted in exactly one place — here —
 * and nowhere else. If the two models ever diverge, this is the single spot
 * that has to notice.
 */
interface CatalogDelegate {
  findFirst(args: unknown): Promise<CatalogRecord | null>
  findMany(args: unknown): Promise<CatalogRecord[]>
  count(args: unknown): Promise<number>
  create(args: unknown): Promise<CatalogRecord>
  update(args: unknown): Promise<CatalogRecord>
}

interface LinkDelegate {
  findUnique(args: unknown): Promise<LinkRecord | null>
  findMany(args: unknown): Promise<LinkRecord[]>
  updateMany(args: unknown): Promise<{ count: number }>
  createMany(args: unknown): Promise<{ count: number }>
  create(args: unknown): Promise<LinkRecord>
  update(args: unknown): Promise<LinkRecord>
  groupBy(args: unknown): Promise<{ _count: { _all: number } }[]>
}

interface CatalogRecord {
  id         : string
  code       : string
  slug       : string
  name       : string
  description: string | null
  status     : TaxonomyStatus
}

interface LinkRecord {
  id     : string
  status : GeoStatus
}

interface ProfileLinkDelegate {
  groupBy(args: unknown): Promise<{ _count: { _all: number } }[] & Record<string, unknown>[]>
}

interface KindConfig {
  catalog     : CatalogDelegate
  link        : LinkDelegate
  /** The vendor-profile join, for adoption counts. */
  profileLink : ProfileLinkDelegate
  /** The catalog's FK column on the per-country and vendor-profile joins. */
  fk          : "cuisineId" | "dietaryTagId"
  /** Audit entityType + the `entity.verb` prefix for audit actions. */
  entity      : "Cuisine" | "DietaryTag"
  linkEntity  : "CuisineCountry" | "DietaryTagCountry"
  auditPrefix : "cuisine" | "dietary_tag"
  /** Human label used in error messages the admin actually reads. */
  label       : string
}

function configFor(kind: FoodTagKind): KindConfig {
  return kind === "CUISINE"
    ? {
        catalog    : prisma.cuisine as unknown as CatalogDelegate,
        link       : prisma.cuisineCountry as unknown as LinkDelegate,
        profileLink: prisma.vendorProfileCuisine as unknown as ProfileLinkDelegate,
        fk         : "cuisineId",
        entity     : "Cuisine",
        linkEntity : "CuisineCountry",
        auditPrefix: "cuisine",
        label      : "Cuisine",
      }
    : {
        catalog    : prisma.dietaryTag as unknown as CatalogDelegate,
        link       : prisma.dietaryTagCountry as unknown as LinkDelegate,
        profileLink: prisma.vendorProfileDietaryTag as unknown as ProfileLinkDelegate,
        fk         : "dietaryTagId",
        entity     : "DietaryTag",
        linkEntity : "DietaryTagCountry",
        auditPrefix: "dietary_tag",
        label      : "Dietary tag",
      }
}

// ─── scope guards ─────────────────────────────────────────────────────────────

/** Catalog entries are global vocabulary, owned by no single market. */
function assertGlobalScope(scope: AdminScopeContext): void {
  if (!scope.isGlobal) {
    throw new ApiError(
      403,
      "Only a global admin can change the catalog. You can switch existing entries on or off for your own country.",
      "SCOPE_FORBIDDEN",
    )
  }
}

function assertCountryInScope(countryId: string, scope: AdminScopeContext): void {
  if (!scope.isGlobal && !scope.countryIds.includes(countryId)) {
    throw new ApiError(403, "This country is outside your scope", "SCOPE_FORBIDDEN")
  }
}

/**
 * Which entries a market offers is a country-WIDE decision, so a city-tier
 * admin must not make it — a Nairobi launch lead should not decide what
 * cuisines all of Kenya can pick from.
 *
 * assertCountryInScope alone does not catch this: buildScopeContext folds a
 * CITY scope's own countryId into countryIds (so city-scoped reads stay
 * filtered to their country), which makes a city admin look country-scoped to
 * any check that only reads countryIds. The tier is what distinguishes them.
 */
function assertCountryPolicyScope(scope: AdminScopeContext): void {
  if (scope.tier === "CITY") {
    throw new ApiError(
      403,
      "Only a country-level admin can change what your country offers.",
      "SCOPE_FORBIDDEN",
    )
  }
}

// ─── shared helpers ───────────────────────────────────────────────────────────

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function codify(value: string): string {
  return value.toUpperCase().trim().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "")
}

/** Numeric suffix on collision — two distinct names can normalize to the same
 *  slug ("Café" vs "Cafe"), same defensive approach as the vendor-type catalog. */
async function ensureUniqueSlug(cfg: KindConfig, base: string, excludeId?: string): Promise<string> {
  let candidate = base
  let attempt = 1
  while (true) {
    const clash = await cfg.catalog.findFirst({
      where : { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
    if (!clash) return candidate
    attempt += 1
    candidate = `${base}-${attempt}`
  }
}

/** UUID-or-slug, same convention as resolveVendorTypeId / resolveCountryId. */
async function resolveTagId(cfg: KindConfig, idOrSlug: string): Promise<CatalogRecord> {
  const isUuid = UUID_RE.test(idOrSlug)
  const record = await cfg.catalog.findFirst({
    where : isUuid ? { id: idOrSlug } : { slug: idOrSlug },
    select: { id: true, code: true, slug: true, name: true, description: true, status: true },
  })
  if (!record) throw new ApiError(404, `${cfg.label} not found`, "NOT_FOUND")
  return record
}

async function resolveCountryId(idOrSlug: string): Promise<string> {
  const isUuid = UUID_RE.test(idOrSlug)
  const country = await prisma.country.findFirst({
    where : isUuid ? { id: idOrSlug } : { slug: idOrSlug },
    select: { id: true },
  })
  if (!country) throw new ApiError(404, "Country not found", "NOT_FOUND")
  return country.id
}

// ─── read ─────────────────────────────────────────────────────────────────────

export interface FoodTagRow {
  id         : string
  code       : string
  slug       : string
  name       : string
  description: string | null
  status     : TaxonomyStatus
  /** Countries with this entry switched on. */
  countryCount: number
  /** Vendor profiles that selected it — what makes suspending one a real decision. */
  vendorCount : number
  /** Only present when a single country is in view. */
  enabledInCountry?: boolean
}

export interface ListFoodTagsParams {
  search?   : string
  status?   : TaxonomyStatus
  /** Resolve per-country enablement against this country (id or slug). */
  countryId?: string
  /** Only entries switched on (or off) for the country in view. */
  availability?: "ENABLED" | "DISABLED"
  page?     : number
  pageSize? : number
}

export interface ListFoodTagsResult {
  tags: FoodTagRow[]
  /** The country enablement was resolved against, if any. */
  countryId : string | null
  total     : number
  page      : number
  pageSize  : number
  totalPages: number
  /** Whole-catalog counts for the country in view — the bulk switch reads
   *  these to know whether "offer everything" is already true. */
  countryEnabledCount?: number
  activeTotal         : number
}

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE     = 100

export async function listFoodTags(
  kind  : FoodTagKind,
  scope : AdminScopeContext,
  params: ListFoodTagsParams = {},
): Promise<ListFoodTagsResult> {
  const cfg = configFor(kind)

  /*
   * Which country's enablement to show. A country-scoped admin never picks:
   * their own country is resolved for them, and an explicit choice is always
   * scope-checked, so a Kenyan admin cannot look at (or change) another market
   * by passing its id.
   */
  let countryId: string | null = null
  if (params.countryId) {
    countryId = await resolveCountryId(params.countryId)
    assertCountryInScope(countryId, scope)
  } else if (!scope.isGlobal && scope.countryIds.length === 1) {
    countryId = scope.countryIds[0] ?? null
  }

  /*
   * Availability is a filter on the per-country JOIN, not on the catalog row,
   * so it has to be expressed as a relation predicate rather than a column
   * match — and it only means anything once a country is in view.
   */
  const availabilityWhere = countryId && params.availability
    ? params.availability === "ENABLED"
      ? { countries: { some: { countryId, status: GeoStatus.ACTIVE } } }
      : { countries: { none: { countryId, status: GeoStatus.ACTIVE } } }
    : {}

  const where = {
    deletedAt: null,
    ...(params.status ? { status: params.status } : {}),
    ...availabilityWhere,
    ...(params.search
      ? {
          OR: [
            { name: { contains: params.search, mode: "insensitive" } },
            { code: { contains: params.search, mode: "insensitive" } },
          ],
        }
      : {}),
  }

  const pageSize = Math.min(Math.max(params.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
  const page     = Math.max(params.page ?? 1, 1)

  /*
   * `activeTotal` and `countryEnabledCount` are deliberately counted against
   * the whole catalog, NOT the filtered page — the bulk "offer everything"
   * switch has to know whether every ACTIVE entry is already on, and a
   * page-local count would flip it the moment someone typed in the search box.
   */
  const [total, records, activeTotal, countryEnabledCount] = await Promise.all([
    cfg.catalog.count({ where }),
    cfg.catalog.findMany({
      where,
      orderBy: { name: "asc" },
      skip   : (page - 1) * pageSize,
      take   : pageSize,
      select : {
        id: true, code: true, slug: true, name: true, description: true, status: true,
        _count: { select: { countries: true, vendorProfiles: true } },
      },
    }) as Promise<(CatalogRecord & { _count: { countries: number; vendorProfiles: number } })[]>,
    cfg.catalog.count({ where: { deletedAt: null, status: TaxonomyStatus.ACTIVE } }),
    countryId
      ? cfg.catalog.count({
          where: {
            deletedAt: null,
            status   : TaxonomyStatus.ACTIVE,
            countries: { some: { countryId, status: GeoStatus.ACTIVE } },
          },
        })
      : Promise.resolve(undefined),
  ])

  /*
   * One query for the whole page's enablement rather than one per row. Only
   * ACTIVE links count — a disabled link is kept (rather than deleted) so
   * re-enabling restores the same row and its history.
   */
  let enabled = new Set<string>()
  if (countryId && records.length > 0) {
    const links = await cfg.link.findMany({
      where : { countryId, status: GeoStatus.ACTIVE, [cfg.fk]: { in: records.map((r) => r.id) } },
      select: { [cfg.fk]: true },
    }) as unknown as Record<string, string>[]
    enabled = new Set(links.map((l) => l[cfg.fk] as string))
  }

  return {
    countryId,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    activeTotal,
    ...(countryEnabledCount !== undefined ? { countryEnabledCount } : {}),
    tags: records.map((r) => ({
      id         : r.id,
      code       : r.code,
      slug       : r.slug,
      name       : r.name,
      description: r.description,
      status     : r.status,
      countryCount: r._count.countries,
      vendorCount : r._count.vendorProfiles,
      ...(countryId ? { enabledInCountry: enabled.has(r.id) } : {}),
    })),
  }
}

// ─── catalog mutations (GLOBAL scope only) ────────────────────────────────────

export interface UpsertFoodTagInput {
  name        : string
  description?: string
  /** Optional — derived from the name when omitted. Immutable once created. */
  code?       : string
}

export async function createFoodTag(
  kind   : FoodTagKind,
  input  : UpsertFoodTagInput,
  actorId: string,
  scope  : AdminScopeContext,
) {
  assertGlobalScope(scope)
  const cfg = configFor(kind)

  const name = input.name?.trim()
  if (!name) throw new ApiError(400, "Name is required", "MISSING_FIELDS")

  const code = codify(input.code || name)
  if (!code) throw new ApiError(400, "Name must contain at least one letter or number", "INVALID_NAME")

  const existing = await cfg.catalog.findFirst({ where: { code }, select: { id: true } })
  if (existing) throw new ApiError(409, `A ${cfg.label.toLowerCase()} with this code already exists`, "DUPLICATE_CODE")

  const slug = await ensureUniqueSlug(cfg, slugify(name))

  const created = await cfg.catalog.create({
    data: { code, slug, name, description: input.description?.trim() || null, createdByAdminId: actorId },
  })

  serviceLog.info({ kind, id: created.id, code, actorId }, "Food tag created")
  auditService.log({
    adminUserId: actorId,
    action     : `${cfg.auditPrefix}.created`,
    entityType : cfg.entity,
    entityId   : created.id,
    changes    : { after: { code, name, slug } },
  })

  return created
}

export async function updateFoodTag(
  kind    : FoodTagKind,
  idOrSlug: string,
  input   : { name?: string; description?: string },
  actorId : string,
  scope   : AdminScopeContext,
) {
  assertGlobalScope(scope)
  const cfg = configFor(kind)
  const current = await resolveTagId(cfg, idOrSlug)

  const name = input.name?.trim()
  if (name !== undefined && !name) throw new ApiError(400, "Name cannot be empty", "INVALID_NAME")

  // Renaming regenerates the slug, same as the vendor-type catalog. `code` is
  // deliberately immutable — it is the stable key the seed and any future
  // integration match on.
  const slug = name && name !== current.name
    ? await ensureUniqueSlug(cfg, slugify(name), current.id)
    : undefined

  const updated = await cfg.catalog.update({
    where: { id: current.id },
    data : {
      ...(name !== undefined ? { name } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
    },
  })

  serviceLog.info({ kind, id: current.id, actorId }, "Food tag updated")
  auditService.log({
    adminUserId: actorId,
    action     : `${cfg.auditPrefix}.updated`,
    entityType : cfg.entity,
    entityId   : current.id,
    changes    : { before: { name: current.name, description: current.description }, after: { name, description: input.description } },
  })

  return updated
}

/*
 * Suspend / reactivate / retire. Deliberately a status change and never a
 * delete: vendor profiles reference these rows (VendorProfileCuisine is
 * onDelete: Restrict), and a customer-facing tag that vanishes would silently
 * rewrite what a vendor said about themselves. A SUSPENDED entry stops being
 * offered to new vendors while every existing selection stays intact.
 */
export async function setFoodTagStatus(
  kind    : FoodTagKind,
  idOrSlug: string,
  status  : TaxonomyStatus,
  actorId : string,
  scope   : AdminScopeContext,
) {
  assertGlobalScope(scope)
  const cfg = configFor(kind)
  const current = await resolveTagId(cfg, idOrSlug)

  if (current.status === status) {
    throw new ApiError(400, `This ${cfg.label.toLowerCase()} is already ${status.toLowerCase()}`, "ALREADY_IN_STATUS")
  }

  const updated = await cfg.catalog.update({ where: { id: current.id }, data: { status } })

  serviceLog.info({ kind, id: current.id, status, actorId }, "Food tag status changed")
  auditService.log({
    adminUserId: actorId,
    action     : `${cfg.auditPrefix}.status_changed`,
    entityType : cfg.entity,
    entityId   : current.id,
    changes    : { before: { status: current.status }, after: { status } },
  })

  return updated
}

// ─── per-country availability (country scope) ─────────────────────────────────

/*
 * Switching an entry on or off for one market. This is the half a
 * country-scoped vendor_ops admin can reach — no assertGlobalScope, only
 * assertCountryInScope.
 *
 * Disabling keeps the row and flips its status, mirroring
 * removeVendorTypeFromCountry: re-enabling later restores the same row rather
 * than orphaning who first enabled it and when.
 */
export async function setFoodTagCountryAvailability(
  kind          : FoodTagKind,
  idOrSlug      : string,
  countryIdOrSlug: string,
  enabled       : boolean,
  actorId       : string,
  scope         : AdminScopeContext,
) {
  const cfg = configFor(kind)
  assertCountryPolicyScope(scope)
  const countryId = await resolveCountryId(countryIdOrSlug)
  assertCountryInScope(countryId, scope)

  const tag = await resolveTagId(cfg, idOrSlug)

  // A suspended or retired entry is not global vocabulary any more, so a
  // country cannot newly opt into it. Turning one OFF stays allowed — that is
  // exactly how a market cleans up after a global suspension.
  if (enabled && tag.status !== TaxonomyStatus.ACTIVE) {
    throw new ApiError(
      400,
      `"${tag.name}" is ${tag.status.toLowerCase()} globally and can't be switched on.`,
      "TAG_NOT_ACTIVE",
    )
  }

  const existing = await cfg.link.findUnique({
    where : { [`countryId_${cfg.fk}`]: { countryId, [cfg.fk]: tag.id } },
    select: { id: true, status: true },
  })

  const target = enabled ? GeoStatus.ACTIVE : GeoStatus.INACTIVE

  if (existing) {
    if (existing.status === target) {
      return { id: existing.id, enabled }
    }
    await cfg.link.update({ where: { id: existing.id }, data: { status: target } })
    logAvailability(cfg, actorId, existing.id, countryId, tag.id, enabled, existing.status)
    return { id: existing.id, enabled }
  }

  if (!enabled) {
    // Nothing to turn off — treated as already-off rather than an error, so the
    // toggle is idempotent from the UI's point of view.
    return { id: null, enabled: false }
  }

  const created = await cfg.link.create({
    data: { countryId, [cfg.fk]: tag.id, createdByAdminId: actorId },
  })
  logAvailability(cfg, actorId, created.id, countryId, tag.id, true, null)
  return { id: created.id, enabled: true }
}

function logAvailability(
  cfg      : KindConfig,
  actorId  : string,
  linkId   : string,
  countryId: string,
  tagId    : string,
  enabled  : boolean,
  before   : GeoStatus | null,
) {
  serviceLog.info({ linkId, countryId, tagId, enabled, actorId }, "Food tag country availability changed")
  auditService.log({
    adminUserId: actorId,
    action     : `${cfg.auditPrefix}_country.${enabled ? "enabled" : "disabled"}`,
    entityType : cfg.linkEntity,
    entityId   : linkId,
    changes    : {
      ...(before ? { before: { status: before } } : {}),
      after: { countryId, [cfg.fk]: tagId, status: enabled ? GeoStatus.ACTIVE : GeoStatus.INACTIVE },
    },
  })
}

/**
 * Switch every ACTIVE catalog entry on (or every entry off) for one country in
 * a single action — "offer all cuisines in Kenya".
 *
 * Same scope rules as the per-entry toggle: a country-wide policy decision, so
 * city-tier is refused and the country must be in the actor's scope.
 *
 * Enabling only ever covers ACTIVE entries. A globally suspended entry stays
 * off, matching the per-entry rule that a country cannot opt into vocabulary
 * that is no longer offered platform-wide — otherwise "offer everything" would
 * quietly resurrect entries an admin had deliberately withdrawn.
 *
 * ONE audit row for the whole action, not one per entry: an admin pressed one
 * switch, and thirty near-identical rows would bury the actual decision in the
 * trail. The row records how many entries moved.
 */
export async function setAllFoodTagsForCountry(
  kind           : FoodTagKind,
  countryIdOrSlug: string,
  enabled        : boolean,
  actorId        : string,
  scope          : AdminScopeContext,
) {
  const cfg = configFor(kind)
  assertCountryPolicyScope(scope)
  const countryId = await resolveCountryId(countryIdOrSlug)
  assertCountryInScope(countryId, scope)

  const target = enabled ? GeoStatus.ACTIVE : GeoStatus.INACTIVE

  if (!enabled) {
    // Turning everything off never needs new rows — only the existing ACTIVE
    // links have anything to change.
    const { count } = await cfg.link.updateMany({
      where: { countryId, status: GeoStatus.ACTIVE },
      data : { status: GeoStatus.INACTIVE },
    })
    logBulk(cfg, actorId, countryId, false, count)
    return { changed: count, enabled: false }
  }

  const [entries, existing] = await Promise.all([
    cfg.catalog.findMany({
      where : { deletedAt: null, status: TaxonomyStatus.ACTIVE },
      select: { id: true },
    }) as Promise<{ id: string }[]>,
    cfg.link.findMany({ where: { countryId }, select: { id: true, status: true, [cfg.fk]: true } }) as unknown as Promise<
      { id: string; status: GeoStatus; [key: string]: unknown }[]
    >,
  ])

  const byTagId = new Map(existing.map((l) => [l[cfg.fk] as string, l]))
  const toReactivate = entries.filter((e) => byTagId.get(e.id)?.status === GeoStatus.INACTIVE)
  const toCreate     = entries.filter((e) => !byTagId.has(e.id))

  /*
   * Reactivate the soft-disabled rows rather than deleting and recreating, so
   * whoever first enabled an entry (and when) survives a bulk pass — the same
   * reason the per-entry toggle flips status instead of removing the row.
   */
  let changed = 0
  if (toReactivate.length > 0) {
    const { count } = await cfg.link.updateMany({
      where: { id: { in: toReactivate.map((e) => byTagId.get(e.id)!.id) } },
      data : { status: GeoStatus.ACTIVE },
    })
    changed += count
  }
  if (toCreate.length > 0) {
    const { count } = await cfg.link.createMany({
      data: toCreate.map((e) => ({ countryId, [cfg.fk]: e.id, createdByAdminId: actorId })),
      skipDuplicates: true,
    })
    changed += count
  }

  logBulk(cfg, actorId, countryId, true, changed)
  return { changed, enabled: true, target }
}

function logBulk(
  cfg      : KindConfig,
  actorId  : string,
  countryId: string,
  enabled  : boolean,
  changed  : number,
) {
  serviceLog.info({ countryId, enabled, changed, actorId }, "Food tag availability changed in bulk")
  auditService.log({
    adminUserId: actorId,
    action     : `${cfg.auditPrefix}_country.bulk_${enabled ? "enabled" : "disabled"}`,
    entityType : cfg.linkEntity,
    // Country-level action, so the country is the entity — there is no single
    // link row this describes.
    entityId   : countryId,
    changes    : { after: { status: enabled ? GeoStatus.ACTIVE : GeoStatus.INACTIVE } },
    metadata   : { countryId, changed },
  })
}

// ─── adoption ─────────────────────────────────────────────────────────────────

export interface FoodTagAdoptionItem {
  id     : string
  slug   : string
  name   : string
  status : TaxonomyStatus
  /** Vendor profiles in scope that selected this entry. */
  count  : number
  /** Share of in-scope profiles, not of selections — a vendor picks several
   *  cuisines, so selections sum well past 100% and would mislead. */
  share  : number
  /** Only set when a single country is in view: is it even offered there. */
  offeredInCountry?: boolean
}

export interface FoodTagAdoptionResult {
  /** Vendor profiles the shares are measured against. */
  profileTotal : number
  /** Every selection made across those profiles. */
  selectionTotal: number
  /** Active catalog entries with no profile behind them, in scope. */
  unadoptedCount: number
  /** Active entries offered in the country in view. Null when none is. */
  offeredCount : number | null
  items        : FoodTagAdoptionItem[]
}

/**
 * Which cuisines / dietary tags vendors actually chose.
 *
 * Deliberately not modelled on getVendorTypeAdoption's shape: a vendor has
 * exactly one vendorTypeId, so that function can treat its counts as a
 * partition and hand back percentages of a whole. A vendor picks up to five
 * cuisines and eight dietary tags, so the same arithmetic would produce shares
 * summing to several hundred percent. Here the denominator is stated
 * explicitly — profiles, not selections — and no "others" bucket is invented,
 * because there is no whole to take a remainder of.
 *
 * Zero-adoption entries are returned rather than filtered out: "we offer this
 * in Kenya and nobody has picked it" is the finding an ops admin came for, and
 * dropping those rows would hide exactly that.
 */
export async function getFoodTagAdoption(
  kind  : FoodTagKind,
  scope : AdminScopeContext,
  params: { countryId?: string } = {},
): Promise<FoodTagAdoptionResult> {
  const cfg = configFor(kind)

  // Same country resolution as listFoodTags — an explicit id is always
  // scope-checked, so a country filter can never widen access.
  let countryId: string | null = null
  if (params.countryId) {
    countryId = await resolveCountryId(params.countryId)
    assertCountryInScope(countryId, scope)
  } else if (!scope.isGlobal && scope.countryIds.length === 1) {
    countryId = scope.countryIds[0] ?? null
  }

  const scopedCountryIds = scope.isGlobal
    ? (countryId ? [countryId] : null)
    : scope.countryIds

  /* A profile belongs to a vendor account, and the account is what carries the
   * country — so scope is applied through the relation, never re-derived. */
  const profileWhere = {
    vendorAccount: {
      deletedAt: null,
      ...(scopedCountryIds ? { countryId: { in: scopedCountryIds } } : {}),
    },
  }

  const [profileTotal, grouped, catalog, offeredLinks] = await Promise.all([
    prisma.vendorProfile.count({ where: profileWhere }),
    cfg.profileLink.groupBy({
      by    : [cfg.fk],
      where : { vendorProfile: profileWhere },
      _count: { _all: true },
    }),
    cfg.catalog.findMany({
      where  : { deletedAt: null },
      orderBy: { name: "asc" },
      select : { id: true, slug: true, name: true, status: true },
    }),
    countryId
      ? cfg.link.findMany({
          where : { countryId, status: GeoStatus.ACTIVE },
          select: { [cfg.fk]: true },
        })
      : Promise.resolve([]),
  ])

  const countById = new Map<string, number>()
  for (const row of grouped as unknown as Record<string, unknown>[]) {
    const id = row[cfg.fk] as string
    countById.set(id, (row._count as { _all: number })._all)
  }

  const offeredIds = countryId
    ? new Set((offeredLinks as unknown as Record<string, unknown>[]).map((l) => l[cfg.fk] as string))
    : null

  const items: FoodTagAdoptionItem[] = catalog.map((tag) => {
    const count = countById.get(tag.id) ?? 0
    return {
      id    : tag.id,
      slug  : tag.slug,
      name  : tag.name,
      status: tag.status,
      count,
      share : profileTotal > 0 ? Math.round((count / profileTotal) * 1000) / 10 : 0,
      ...(offeredIds ? { offeredInCountry: offeredIds.has(tag.id) } : {}),
    }
  })

  // Most-adopted first; ties alphabetical, so the order is stable between loads.
  items.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  const activeItems = items.filter((i) => i.status === TaxonomyStatus.ACTIVE)

  return {
    profileTotal,
    selectionTotal: items.reduce((sum, i) => sum + i.count, 0),
    unadoptedCount: activeItems.filter((i) => i.count === 0).length,
    offeredCount  : offeredIds ? activeItems.filter((i) => i.offeredInCountry).length : null,
    items,
  }
}
