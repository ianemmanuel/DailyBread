/*
 * Smoke test — marketing hero promotions, against the DEV DATABASE.
 *
 * Exercises every new Prisma query the module makes: the scoped list, the
 * scoped read, create, update, publish, archive, and the CITY -> COUNTRY ->
 * GLOBAL resolver. Asserts on the REASON a call failed, not merely that it
 * did — a test that passes because an unrelated error leaked proves nothing.
 *
 * Cleans up after itself, and sweeps strays from an aborted earlier run before
 * it starts. Image processing is NOT exercised here: it needs the public
 * bucket, which is provisioned by hand. `lib/images/transform.test.ts` covers
 * the pipeline itself.
 *
 *   npx tsx scripts/smoke/marketing.heroPromotion.smoke.ts
 */
import { HeroPromotionScope, HeroPromotionStatus, prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"

import { ApiError } from "@/errors/ApiError"
import {
  archiveHeroPromotion,
  createHeroPromotion,
  getHeroPromotion,
  listHeroPromotions,
  publishHeroPromotion,
  resolveHeroPromotionFor,
  updateHeroPromotion,
} from "@/modules/marketing/services/heroPromotion.service"

const MARKER = "[smoke] hero promotion"

const GLOBAL_SCOPE: AdminScopeContext = {
  isGlobal: true,
  countryIds: [],
  cityIds: [],
  tier: "GLOBAL",
}

let passed = 0
let failed = 0

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++
    console.log(`  ok   ${label}`)
  } else {
    failed++
    console.error(`  FAIL ${label}`, detail ?? "")
  }
}

/** Asserts the call failed for the REASON we expect, by error code. */
async function expectFailure(label: string, code: string, run: () => Promise<unknown>) {
  try {
    await run()
    check(`${label} — should have been refused`, false)
  } catch (err) {
    const actual = err instanceof ApiError ? err.code : `${(err as Error)?.name}`
    check(`${label} (${code})`, actual === code, `got ${actual}: ${(err as Error)?.message}`)
  }
}

async function sweep() {
  const { count } = await prisma.heroPromotion.deleteMany({
    where: { headline: { startsWith: MARKER } },
  })
  if (count) console.log(`  swept ${count} stray row(s) from an earlier run`)
}

async function main() {
  console.log("marketing / hero promotions — smoke\n")
  await sweep()

  /* Every mutation writes an AuditLog row whose adminUserId is a real FK, so
   * the smoke test has to act as a real admin rather than a made-up id. */
  const admin = await prisma.adminUser.findFirst({ select: { id: true } })
  if (!admin) {
    console.error("Need at least one AdminUser in the dev DB. Aborting.")
    process.exitCode = 1
    return
  }
  const ACTOR = admin.id

  const city = await prisma.city.findFirst({ select: { id: true, slug: true, countryId: true } })
  const country = await prisma.country.findFirst({ select: { id: true, slug: true } })
  if (!city || !country) {
    console.error("Need at least one city and one country in the dev DB. Aborting.")
    process.exitCode = 1
    return
  }
  /* The city's OWN country, not just any country: a city-tier admin has their
   * country folded into countryIds, so this is the case where only the TIER
   * separates them from a country admin. Using a different country would 404
   * on scope instead, and never reach the guard being tested. */
  const ownCountry = await prisma.country.findUniqueOrThrow({
    where: { id: city.countryId },
    select: { slug: true },
  })

  const otherCity = await prisma.city.findFirst({
    where: { id: { not: city.id } },
    select: { id: true, slug: true },
  })

  const created: string[] = []

  try {
    /* ── create ─────────────────────────────────────────────────────────── */
    const globalPromo = await createHeroPromotion(
      { scope: "GLOBAL", headline: `${MARKER} global`, ctaHref: "/discover" },
      ACTOR,
      GLOBAL_SCOPE,
    )
    created.push(globalPromo.id)
    check("creates a global promotion as DRAFT", globalPromo.status === "DRAFT")
    check("a new promotion has no image", globalPromo.image === null)

    const countryPromo = await createHeroPromotion(
      { scope: "COUNTRY", countryRef: country.slug, headline: `${MARKER} country` },
      ACTOR,
      GLOBAL_SCOPE,
    )
    created.push(countryPromo.id)
    check("resolves a country by slug", countryPromo.countryId === country.id)

    const cityPromo = await createHeroPromotion(
      { scope: "CITY", cityRef: city.slug, headline: `${MARKER} city` },
      ACTOR,
      GLOBAL_SCOPE,
    )
    created.push(cityPromo.id)
    check("a city promotion carries its country too", cityPromo.countryId === city.countryId)

    /* ── shape and window rules ─────────────────────────────────────────── */
    await expectFailure("city promotion with no city", "MISSING_FIELDS", () =>
      createHeroPromotion({ scope: "CITY", headline: `${MARKER} bad` }, ACTOR, GLOBAL_SCOPE),
    )
    await expectFailure("global promotion naming a country", "INVALID_SCOPE", () =>
      createHeroPromotion(
        { scope: "GLOBAL", countryRef: country.slug, headline: `${MARKER} bad` },
        ACTOR,
        GLOBAL_SCOPE,
      ),
    )
    await expectFailure("run window that ends before it starts", "INVALID_WINDOW", () =>
      createHeroPromotion(
        {
          scope: "GLOBAL",
          headline: `${MARKER} bad`,
          startsAt: new Date("2026-06-01"),
          endsAt: new Date("2026-01-01"),
        },
        ACTOR,
        GLOBAL_SCOPE,
      ),
    )

    /* ── publish requires an image ──────────────────────────────────────── */
    await expectFailure("publishing with no image", "IMAGE_REQUIRED", () =>
      publishHeroPromotion(globalPromo.id, {}, ACTOR, GLOBAL_SCOPE),
    )

    /* Give them images directly — the processing path needs the public bucket,
     * which is provisioned by hand. */
    await prisma.heroPromotion.updateMany({
      where: { id: { in: created } },
      data: {
        imageKey: "marketing/hero/smoke.webp",
        imageWidth: 1600,
        imageHeight: 1600,
      },
    })

    /* ── update ─────────────────────────────────────────────────────────── */
    const renamed = await updateHeroPromotion(
      globalPromo.id,
      { headline: `${MARKER} global renamed`, priority: 7 },
      ACTOR,
      GLOBAL_SCOPE,
    )
    check("updates copy and priority", renamed.headline.endsWith("renamed") && renamed.priority === 7)

    /* ── scope enforcement ──────────────────────────────────────────────── */
    const cityTier: AdminScopeContext = {
      isGlobal: false,
      countryIds: [city.countryId],
      cityIds: [city.id],
      tier: "CITY",
    }
    await expectFailure("city admin writing a GLOBAL promotion", "MARKETING_SCOPE_FORBIDDEN", () =>
      createHeroPromotion({ scope: "GLOBAL", headline: `${MARKER} bad` }, ACTOR, cityTier),
    )
    await expectFailure(
      "city admin writing a COUNTRY-wide promotion",
      "MARKETING_SCOPE_FORBIDDEN",
      () =>
        createHeroPromotion(
          { scope: "COUNTRY", countryRef: ownCountry.slug, headline: `${MARKER} bad` },
          ACTOR,
          cityTier,
        ),
    )
    if (otherCity) {
      await expectFailure("city admin reaching another city", "NOT_FOUND", () =>
        createHeroPromotion(
          { scope: "CITY", cityRef: otherCity.slug, headline: `${MARKER} bad` },
          ACTOR,
          cityTier,
        ),
      )
    }

    /* A scoped read must 404 out-of-scope rows the same as missing ones. */
    const foreignScope: AdminScopeContext = {
      isGlobal: false,
      countryIds: ["00000000-0000-0000-0000-000000000000"],
      cityIds: [],
      tier: "COUNTRY",
    }
    await expectFailure("reading a promotion outside your scope", "NOT_FOUND", () =>
      getHeroPromotion(cityPromo.id, foreignScope),
    )

    /* ── list ───────────────────────────────────────────────────────────── */
    const listed = await listHeroPromotions(
      { page: 1, pageSize: 100, status: "DRAFT" },
      GLOBAL_SCOPE,
    )
    check(
      "lists the drafts it created",
      created.every((id) => listed.items.some((item) => item.id === id)),
    )

    const cityScoped = await listHeroPromotions({ page: 1, pageSize: 100 }, cityTier)
    check(
      "a city admin never sees another country's promotions",
      cityScoped.items.every(
        (item) =>
          item.scope === "GLOBAL" || item.cityId === city.id || item.countryId === city.countryId,
      ),
    )

    /* ── publish and resolve ────────────────────────────────────────────── */
    await publishHeroPromotion(globalPromo.id, {}, ACTOR, GLOBAL_SCOPE)
    await publishHeroPromotion(countryPromo.id, {}, ACTOR, GLOBAL_SCOPE)
    await publishHeroPromotion(cityPromo.id, {}, ACTOR, GLOBAL_SCOPE)

    const inCity = await resolveHeroPromotionFor({ cityId: city.id, countryId: city.countryId })
    check("a visitor in the city gets the city promotion", inCity?.id === cityPromo.id)

    const inCountry = await resolveHeroPromotionFor({ cityId: null, countryId: country.id })
    check("elsewhere in the country, the country promotion", inCountry?.id === countryPromo.id)

    const unknown = await resolveHeroPromotionFor({ cityId: null, countryId: null })
    check("an unknown location gets the global default", unknown?.id === globalPromo.id)

    if (otherCity) {
      const elsewhere = await resolveHeroPromotionFor({
        cityId: otherCity.id,
        countryId: "00000000-0000-0000-0000-000000000000",
      })
      check("another city never sees this city's promotion", elsewhere?.id === globalPromo.id)
    }

    /* A run window that has not opened yet must not resolve. */
    await prisma.heroPromotion.update({
      where: { id: cityPromo.id },
      data: { startsAt: new Date(Date.now() + 86_400_000) },
    })
    const beforeWindow = await resolveHeroPromotionFor({
      cityId: city.id,
      countryId: city.countryId,
    })
    check("a promotion whose window has not opened does not show", beforeWindow?.id !== cityPromo.id)

    /* ── archive ────────────────────────────────────────────────────────── */
    const archived = await archiveHeroPromotion(countryPromo.id, ACTOR, GLOBAL_SCOPE)
    check("archives rather than deletes", archived.status === "ARCHIVED")
    check(
      "the archived row is still there",
      (await prisma.heroPromotion.count({ where: { id: countryPromo.id } })) === 1,
    )
    const afterArchive = await resolveHeroPromotionFor({ cityId: null, countryId: country.id })
    check("an archived promotion stops resolving", afterArchive?.id !== countryPromo.id)
  } finally {
    const { count } = await prisma.heroPromotion.deleteMany({
      where: { headline: { startsWith: MARKER } },
    })
    console.log(`\n  cleaned up ${count} row(s)`)
    await prisma.$disconnect()
  }

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

void main()
