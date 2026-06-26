/**
 * admin.region.service.ts
 *
 * READ-WRITE service for the Region domain.
 * Reads: list, detail, breakdown for the donut chart.
 * Writes: create, assign country, remove country, update, soft-deactivate.
 *
 * Why we include write operations now even though no UI exists yet:
 * The Region model is live in the DB from the migration, so seed scripts
 * and future pages need these functions. Keeping them here avoids a second
 * service file later.
 *
 * Scope notes:
 * - Regions are a global concept — there is no per-country scope on them.
 * - Scoped admins can READ region breakdown (filtered to their countries).
 * - Only global admins should CREATE / UPDATE / DELETE regions (enforced
 *   at the controller level via requirePermission).
 */

import { prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import type {
    RegionSummaryResult,
    RegionWithCountries,
    RegionBreakdown,
    RegionBreakdownItem,
} from "@/types/admin"

/* ── helpers ──────────────────────────────────────────────── */

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/* ══════════════════════════════════════════════════════════════
   READ OPERATIONS
   ══════════════════════════════════════════════════════════════ */

/**
 * List all regions with country counts.
 * Scoped admins see the same region list as global admins — regions are
 * global groupings. The country counts are unfiltered (platform-wide).
 */
export async function getRegions(): Promise<RegionSummaryResult[]> {
  return prisma.region.findMany({
    orderBy: { name: "asc" },
    select: {
      id:          true,
      name:        true,
      slug:        true,
      code:        true,
      description: true,
      status:      true,
      createdAt:   true,
      _count: {
        select: { countries: true },
      },
    },
  })
}

/**
 * Get a single region with its full country list.
 * Used on the Region detail page.
 */
export async function getRegionBySlug(slug: string): Promise<RegionWithCountries | null> {
  return prisma.region.findUnique({
    where : { slug },
    select: {
      id:          true,
      name:        true,
      slug:        true,
      code:        true,
      description: true,
      status:      true,
      createdAt:   true,
      countries: {
        orderBy: { name: "asc" },
        select: {
          id:     true,
          name:   true,
          slug:   true,
          code:   true,
          status: true,
        },
      },
    },
  })
}

/**
 * getRegionBreakdown
 *
 * Returns the data needed for the "Countries by Region" donut chart.
 * Scoped admins get counts filtered to their allowed country IDs,
 * so a country-scoped admin only sees regions their countries belong to.
 *
 * Algorithm:
 *   1. Fetch all active countries (within scope) with their region.
 *   2. Group by region, count per region.
 *   3. Count countries where regionId IS NULL → "Ungrouped".
 *   4. Compute percent share for each region.
 */
export async function getRegionBreakdown(
  scope: AdminScopeContext,
): Promise<RegionBreakdown> {
  // Pull only the fields we need — no over-fetching
  const countries = await prisma.country.findMany({
    where: {
      status: "ACTIVE",
      ...(scope.isGlobal ? {} : { id: { in: scope.countryIds } }),
    },
    select: {
      regionId: true,
      region: {
        select: {
          id:   true,
          name: true,
          code: true,
        },
      },
    },
  })

  const totalActive = countries.length

  // Group by region
  const byRegion = new Map<
    string,
    { regionId: string; regionName: string; regionCode: string; count: number }
  >()

  let ungrouped = 0

  for (const c of countries) {
    if (!c.regionId || !c.region) {
      ungrouped++
      continue
    }
    const existing = byRegion.get(c.regionId)
    if (existing) {
      existing.count++
    } else {
      byRegion.set(c.regionId, {
        regionId:   c.regionId,
        regionName: c.region.name,
        regionCode: c.region.code,
        count:      1,
      })
    }
  }

  // For totalCountries per region (active + inactive), batch-fetch counts
  const regionIds = [...byRegion.keys()]
  const totalsByRegion = regionIds.length > 0
    ? await prisma.$transaction(
        regionIds.map((id) =>
          prisma.country.count({ where: { regionId: id } }),
        ),
      )
    : []

  const activeForPercent = totalActive - ungrouped // denominator excludes ungrouped

  const regions: RegionBreakdownItem[] = [...byRegion.values()].map(
    (r, idx) => ({
      regionId:       r.regionId,
      regionName:     r.regionName,
      regionCode:     r.regionCode,
      countryCount:   r.count,
      totalCountries: totalsByRegion[idx] ?? r.count,
      percent:
        activeForPercent > 0
          ? Math.round((r.count / activeForPercent) * 1000) / 10
          : 0,
    }),
  )

  // Sort descending by active country count
  regions.sort((a, b) => b.countryCount - a.countryCount)

  return { regions, ungroupedCountries: ungrouped, totalActive }
}

/* ══════════════════════════════════════════════════════════════
   WRITE OPERATIONS
   ══════════════════════════════════════════════════════════════ */

export interface CreateRegionInput {
  name:        string
  code:        string   // e.g. "EAF" — must be unique, stored uppercase
  description?: string
}

/**
 * Create a new region.
 * Slug is auto-derived from name. Code is uppercased and trimmed.
 * Throws if name or code already exists (Prisma unique constraint).
 */
export async function createRegion(
  input:       CreateRegionInput,
  adminUserId: string,
): Promise<RegionSummaryResult> {
  const slug = slugify(input.name)
  const code = input.code.trim().toUpperCase()

  const region = await prisma.region.create({
    data: {
      name:            input.name.trim(),
      slug,
      code,
      description:     input.description?.trim() ?? null,
      createdByAdminId: adminUserId,
    },
    select: {
      id:          true,
      name:        true,
      slug:        true,
      code:        true,
      description: true,
      status:      true,
      createdAt:   true,
      _count: { select: { countries: true } },
    },
  })

  return region
}

export interface UpdateRegionInput {
  name?:        string
  code?:        string
  description?: string | null
}

/**
 * Update a region's metadata.
 * Slug is re-derived if name changes.
 * Partial update — only provided fields are written.
 */
export async function updateRegion(
  regionId: string,
  input:    UpdateRegionInput,
): Promise<RegionSummaryResult> {
  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    data.name = input.name.trim()
    data.slug = slugify(input.name)
  }
  if (input.code !== undefined) {
    data.code = input.code.trim().toUpperCase()
  }
  if ("description" in input) {
    data.description = input.description?.trim() ?? null
  }

  return prisma.region.update({
    where : { id: regionId },
    data,
    select: {
      id:          true,
      name:        true,
      slug:        true,
      code:        true,
      description: true,
      status:      true,
      createdAt:   true,
      _count: { select: { countries: true } },
    },
  })
}

/**
 * Assign a country to a region.
 * Replaces any existing region assignment on that country.
 * Idempotent — safe to call if country is already in this region.
 */
export async function assignCountryToRegion(
  countryId: string,
  regionId:  string,
): Promise<void> {
  await prisma.country.update({
    where: { id: countryId },
    data:  { regionId },
  })
}

/**
 * Remove a country from its region (sets regionId = null).
 */
export async function removeCountryFromRegion(
  countryId: string,
): Promise<void> {
  await prisma.country.update({
    where: { id: countryId },
    data:  { regionId: null },
  })
}

/**
 * Set region status to INACTIVE.
 * Does NOT unassign its countries — they remain grouped.
 * The UI can warn before deactivating if the region has countries.
 */
export async function deactivateRegion(regionId: string): Promise<void> {
  await prisma.region.update({
    where: { id: regionId },
    data:  { status: "INACTIVE" },
  })
}

/**
 * Reactivate a previously deactivated region.
 */
export async function activateRegion(regionId: string): Promise<void> {
  await prisma.region.update({
    where: { id: regionId },
    data:  { status: "ACTIVE" },
  })
}