import { prisma } from "@repo/db"
import type { CustomerCuisine, CustomerCuisineDetail, CustomerCuisinesResult } from "@repo/types/backend"

import { publicMediaStorage } from "@/lib/storage/publicMedia.storage"
import { logger } from "@/lib/pino/logger"

/*
 * The food taxonomy, as a customer sees it.
 *
 * ── Three states, and only one of them belongs on a tile ────────────────────
 *
 *   CATALOGUED  the cuisine row exists
 *   ENABLED     an admin switched it on for a country (CuisineCountry)
 *   AVAILABLE   a sellable outlet actually carries it in a given city
 *
 * This read answers CATALOGUED and ENABLED. It deliberately does NOT answer
 * AVAILABLE, because availability is a property of a place and this endpoint
 * is cached per market — mixing the two would make a cached answer depend on
 * live supply. The feed already computes real availability from its own result
 * set, which is the right place for it: a filter chip that returns nothing is
 * a dead end, whereas a marketing tile is an invitation.
 *
 * ── Scope ──────────────────────────────────────────────────────────────────
 *
 * No country → the global catalogue, for the landing page, which has no
 * location and cannot honestly narrow anything.
 * A country → only what that market has switched on, which is what a city
 * page shows.
 */

const catalogLog = logger.child({ module: "customer-catalog-service" })

const CUISINE_SELECT = {
  id: true, slug: true, name: true, description: true,
  imageKey: true, imageWidth: true, imageHeight: true,
  imageBlurDataUrl: true, imageAlt: true,
} as const

interface CuisineRow {
  id: string; slug: string; name: string; description: string | null
  imageKey: string | null; imageWidth: number | null; imageHeight: number | null
  imageBlurDataUrl: string | null; imageAlt: string | null
}

/** A narrow allowlist, like the hero's public presenter and for the same
 *  reason: the DEFAULT must be that a column added later stays private until
 *  somebody publishes it deliberately. No ids-of-other-things, no status, no
 *  storage keys — a key is an internal address and `publicUrl` is the one
 *  place it becomes a URL. */
function presentCuisine(row: CuisineRow): CustomerCuisine {
  const servable = row.imageKey && publicMediaStorage.isConfigured()

  return {
    id  : row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    image: servable
      ? {
          url        : publicMediaStorage.publicUrl(row.imageKey as string),
          width      : row.imageWidth,
          height     : row.imageHeight,
          blurDataUrl: row.imageBlurDataUrl,
          alt        : row.imageAlt,
        }
      : null,
  }
}

/** The catalogue a customer may see: active, not deleted, and — when a
 *  country is given — switched on there. One definition for the list, its
 *  count and the detail read, so they can never disagree. */
function visibleWhere(countryId?: string) {
  return {
    status   : "ACTIVE" as const,
    deletedAt: null,
    ...(countryId
      ? { countries: { some: { countryId, status: "ACTIVE" as const } } }
      : {}),
  }
}

/**
 * A page of the catalogue, with the TOTAL.
 *
 * The landing band asks for a handful (`limit`); the cuisine directories page
 * through everything. Before `total` existed the read simply stopped at 48,
 * which a directory would have presented as the whole catalogue — the same
 * silent truncation as the city picker's old ten-city page (bug class #4).
 */
export async function listCustomerCuisines(input: {
  countryId?: string
  page?     : number
  pageSize? : number
}): Promise<CustomerCuisinesResult> {
  const pageSize = Math.min(Math.max(Math.trunc(input.pageSize ?? 24), 1), 60)
  const page = Math.max(Math.trunc(input.page ?? 1), 1)
  const where = visibleWhere(input.countryId)

  const [rows, total] = await Promise.all([
    prisma.cuisine.findMany({
      where,
      select : CUISINE_SELECT,
      /* Pictured cuisines first (NULLs sort last), then alphabetical — stable
       * between renders as imagery is added. `id` breaks name ties so pages
       * never overlap or skip. */
      orderBy: [{ imageKey: "asc" }, { name: "asc" }, { id: "asc" }],
      skip   : (page - 1) * pageSize,
      take   : pageSize,
    }),
    prisma.cuisine.count({ where }),
  ])

  if (rows.length > 0 && rows.every((r) => !r.imageKey) && publicMediaStorage.isConfigured()) {
    catalogLog.warn(
      { count: rows.length },
      "No cuisine has imagery yet — the storefront will render name-only tiles",
    )
  }

  return { cuisines: rows.map(presentCuisine), total, page, pageSize }
}

/**
 * One active cuisine by slug, with the customer-open countries it is switched
 * on in. Null for an unknown, withdrawn or deleted cuisine — all of which are
 * a 404 to a customer (principle 6).
 *
 * Only countries READY FOR CUSTOMERS are listed: a country still onboarding
 * vendors is not a place anyone can order from, and naming it would advertise
 * a market that does not exist yet.
 */
export async function getCustomerCuisine(slug: string): Promise<CustomerCuisineDetail | null> {
  const row = await prisma.cuisine.findFirst({
    where : { ...visibleWhere(), slug },
    select: {
      ...CUISINE_SELECT,
      countries: {
        where : { status: "ACTIVE", country: { status: "ACTIVE", readyForCustomerOperations: true } },
        select: { countryId: true },
      },
    },
  })
  if (!row) return null

  const { countries, ...cuisine } = row
  return { cuisine: presentCuisine(cuisine), countryIds: countries.map((c) => c.countryId) }
}
