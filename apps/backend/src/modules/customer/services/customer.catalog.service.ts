import { prisma } from "@repo/db"
import type { CustomerCuisine } from "@repo/types/backend"

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

export async function listCustomerCuisines(input: {
  countryId?: string
  /** Hard-capped; a landing page asks for 8. */
  limit?: number
}): Promise<CustomerCuisine[]> {
  const take = Math.min(Math.max(input.limit ?? 24, 1), 48)

  const rows = await prisma.cuisine.findMany({
    where: {
      status   : "ACTIVE",
      deletedAt: null,
      ...(input.countryId
        ? { countries: { some: { countryId: input.countryId, status: "ACTIVE" } } }
        : {}),
    },
    select : CUISINE_SELECT,
    /* Cuisines WITH a picture first: the tile row is the thing this feeds, and
     * a photograph beside a blank square looks broken. Alphabetical within
     * each group so the order is stable between renders and does not shuffle
     * as imagery is added. Postgres sorts NULLs last for ASC by default, which
     * is exactly the grouping wanted. */
    orderBy: [{ imageKey: "asc" }, { name: "asc" }],
    take,
  })

  if (rows.length > 0 && rows.every((r) => !r.imageKey) && publicMediaStorage.isConfigured()) {
    catalogLog.warn(
      { count: rows.length },
      "No cuisine has imagery yet — the storefront will render name-only tiles",
    )
  }

  return rows.map(presentCuisine)
}
