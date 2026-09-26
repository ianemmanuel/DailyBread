/*
 * One-off backfill for `20260926090000_consumer_markets`.
 *
 * Before that migration a customer had ONE default address, flagged on the
 * address row. Defaults are now per CITY and live on `ConsumerMarket`, and the
 * city an address belongs to can only be found by resolving its pin — which
 * SQL cannot do here (no PostGIS). So this runs between the migration that
 * creates the table and the one that drops `ConsumerAddress.isDefault`.
 *
 * For every saved address it records the city as one of the customer's
 * markets. The old account-wide default becomes that city's default address
 * AND the customer's default city, so nobody's landing page moves.
 *
 * Idempotent: upserts only, safe to re-run.
 *
 *   pnpm dlx tsx --env-file=.env scripts/backfill/consumer-markets.ts
 */
import { prisma } from "@repo/db"
import { resolveCustomerLocation } from "@/modules/customer/services/customer.geo.service"

async function main() {
  const addresses = await prisma.$queryRaw<Array<{
    id: string; consumerAccountId: string; latitude: number; longitude: number
    isDefault: boolean; createdAt: Date
  }>>`SELECT "id", "consumerAccountId", "latitude", "longitude", "isDefault", "createdAt"
      FROM "ConsumerAddress" ORDER BY "createdAt" ASC`

  let markets = 0
  let unresolved = 0

  for (const address of addresses) {
    const { city } = await resolveCustomerLocation({
      latitude: address.latitude, longitude: address.longitude,
    })
    if (!city) { unresolved++; continue }

    await prisma.$transaction(async (tx) => {
      if (address.isDefault) {
        await tx.consumerMarket.updateMany({
          where: { consumerAccountId: address.consumerAccountId, isDefault: true, cityId: { not: city.id } },
          data : { isDefault: false },
        })
      }
      await tx.consumerMarket.upsert({
        where : { consumerAccountId_cityId: { consumerAccountId: address.consumerAccountId, cityId: city.id } },
        create: {
          consumerAccountId: address.consumerAccountId,
          cityId           : city.id,
          lastSelectedAt   : address.createdAt,
          ...(address.isDefault ? { isDefault: true, defaultAddressId: address.id } : {}),
        },
        update: address.isDefault ? { isDefault: true, defaultAddressId: address.id } : {},
      })
    })
    markets++
  }

  console.log(`Backfilled ${markets} address(es) into markets; ${unresolved} resolved to no operating city.`)
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
