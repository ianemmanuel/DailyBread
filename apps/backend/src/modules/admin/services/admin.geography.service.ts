import { prisma } from "@repo/db"

/**
 * Geography service — read-only queries used by the admin dashboard.
 * Countries are seeded by developers (migration/seed script).
 * Cities are managed by super_admin through the dashboard (future settings module).
 */

export async function listCountries() {
  return prisma.country.findMany({
    where  : { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select : { id: true, name: true, code: true, currency: true, currencySymbol: true, phoneCode: true, status: true },
  })
}

export async function listCitiesForCountry(countryId: string) {
  return prisma.city.findMany({
    where  : { countryId, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select : { id: true, name: true, code: true, timezone: true, countryId: true, status: true },
  })
}

export async function getCountry(countryId: string) {
  return prisma.country.findUnique({
    where  : { id: countryId },
    include: { cities: { where: { status: "ACTIVE" }, orderBy: { name: "asc" } } },
  })
}

/** Returns only the countries visible to a given scope context */
export async function listCountriesForScope(
  actorCountryIds: string[],
  isGlobal       : boolean,
) {
  if (isGlobal) return listCountries()

  return prisma.country.findMany({
    where  : { id: { in: actorCountryIds }, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select : { id: true, name: true, code: true, currency: true, currencySymbol: true, phoneCode: true, status: true },
  })
}