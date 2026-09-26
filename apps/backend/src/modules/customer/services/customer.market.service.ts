import { prisma } from "@repo/db"
import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"
import type { CustomerMarketsResult } from "@repo/types/backend"
import { loadAddressBook } from "./customer.address.service"
import { getOperatingCities } from "./customer.geo.service"

/*
 * The customer's cities — "Your cities" in the city picker, and the default
 * city that signing in lands on.
 *
 * Choosing a city is a real, durable fact about the customer (unlike which
 * ADDRESS is selected right now, which is per device and lives in a cookie).
 * It is what lets someone who picked Nairobi last week sign in on a new laptop
 * and land in Nairobi, before they have saved any address at all.
 */

/**
 * Record that the customer chose this city, and optionally make it their
 * default city.
 *
 * Selecting NEVER makes a city the default by itself — that is only ever an
 * explicit request. Without one, the default falls back to the most recently
 * selected city (customer.markets.ts), which is the right landing page without
 * pretending the customer made a choice they did not make.
 *
 * Only an operating city can be chosen: the slug is resolved against the same
 * cached list the storefront offers, so a city switched off for customers is a
 * 404 exactly like a city that never existed (principle 6).
 */
export async function selectMarket(
  customerId: string,
  citySlug  : string,
  input     : { isDefault: boolean },
): Promise<CustomerMarketsResult> {
  const city = (await getOperatingCities()).find((c) => c.slug === citySlug)
  if (!city) throw new ApiError(HttpStatus.NOT_FOUND, "City not found.", "CITY_NOT_FOUND")

  await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.consumerMarket.updateMany({
        where: { consumerAccountId: customerId, isDefault: true, cityId: { not: city.id } },
        data : { isDefault: false },
      })
    }
    await tx.consumerMarket.upsert({
      where : { consumerAccountId_cityId: { consumerAccountId: customerId, cityId: city.id } },
      create: { consumerAccountId: customerId, cityId: city.id, isDefault: input.isDefault },
      update: { lastSelectedAt: new Date(), ...(input.isDefault ? { isDefault: true } : {}) },
    })
  })

  const { markets, defaultCitySlug } = await loadAddressBook(customerId)
  return { markets, defaultCitySlug }
}
