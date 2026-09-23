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
    /* The country IS stored on a city row, but it is derived from the city —
     * so sending one was previously accepted and then ignored. */
    await expectFailure("city promotion naming a country", "INVALID_SCOPE", () =>
      createHeroPromotion(
        {
          scope: "CITY",
          cityRef: city.slug,
          countryRef: country.slug,
          headline: `${MARKER} bad`,
        },
        ACTOR,
        GLOBAL_SCOPE,
      ),
    )
    await expectFailure("country promotion naming a city", "INVALID_SCOPE", () =>
      createHeroPromotion(
        {
          scope: "COUNTRY",
          countryRef: country.slug,
          cityRef: city.slug,
          headline: `${MARKER} bad`,
        },
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
      { headline: `${MARKER} global renamed` },
      ACTOR,
      GLOBAL_SCOPE,
    )
    check("updates copy", renamed.headline.endsWith("renamed"))
    check("an untouched promotion stays STANDARD", renamed.priorityTier === "STANDARD")

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

    /* READING IS OPEN across every scope — a marketing admin anywhere may look
     * at what any market is running. What they may not do is WRITE it, and
     * `canManage` is how the ERP knows which is which. */
    const foreignScope: AdminScopeContext = {
      isGlobal: false,
      countryIds: ["00000000-0000-0000-0000-000000000000"],
      cityIds: [],
      tier: "COUNTRY",
    }
    const foreignRead = await getHeroPromotion(cityPromo.id, foreignScope)
    check("an out-of-scope admin can READ any promotion", foreignRead.id === cityPromo.id)
    check("...but is told they cannot manage it", foreignRead.canManage === false)

    const ownRead = await getHeroPromotion(cityPromo.id, GLOBAL_SCOPE)
    check("a global admin is told they CAN manage it", ownRead.canManage === true)

    /* The write is still refused — and now with 403 rather than a pretend 404,
     * because the row's existence stopped being a secret. */
    await expectFailure(
      "an out-of-scope admin still cannot edit it",
      "MARKETING_SCOPE_FORBIDDEN",
      () => updateHeroPromotion(cityPromo.id, { headline: `${MARKER} hijack` }, ACTOR, foreignScope),
    )
    await expectFailure(
      "an out-of-scope admin still cannot archive it",
      "MARKETING_SCOPE_FORBIDDEN",
      () => archiveHeroPromotion(cityPromo.id, ACTOR, foreignScope),
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
      "a city admin sees every promotion, including ones they cannot write",
      created.every((id) => cityScoped.items.some((item) => item.id === id)),
    )
    check(
      "...and each carries whether THEY may manage it",
      cityScoped.items.some((item) => item.canManage) &&
        cityScoped.items.some((item) => !item.canManage),
    )

    /* ── priority tiers and the campaign window ─────────────────────────── */
    await expectFailure(
      "a FEATURED promotion with no end date",
      "CAMPAIGN_NEEDS_END_DATE",
      () =>
        createHeroPromotion(
          { scope: "GLOBAL", headline: `${MARKER} bad`, priorityTier: "FEATURED" },
          ACTOR,
          GLOBAL_SCOPE,
        ),
    )
    await expectFailure(
      "a TAKEOVER promotion with no end date",
      "CAMPAIGN_NEEDS_END_DATE",
      () =>
        createHeroPromotion(
          { scope: "GLOBAL", headline: `${MARKER} bad`, priorityTier: "TAKEOVER" },
          ACTOR,
          GLOBAL_SCOPE,
        ),
    )
    await expectFailure("an end date that has already passed", "WINDOW_ELAPSED", () =>
      createHeroPromotion(
        {
          scope: "GLOBAL",
          headline: `${MARKER} bad`,
          priorityTier: "FEATURED",
          endsAt: new Date("2020-01-01"),
        },
        ACTOR,
        GLOBAL_SCOPE,
      ),
    )
    /* Promoting an existing STANDARD draft to a campaign is the same rule —
     * the tier can change after creation, and that is when the end date
     * starts being required. */
    await expectFailure(
      "raising a promotion to FEATURED without giving it an end date",
      "CAMPAIGN_NEEDS_END_DATE",
      () => updateHeroPromotion(globalPromo.id, { priorityTier: "FEATURED" }, ACTOR, GLOBAL_SCOPE),
    )

    const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    /* Deliberately aimed at the CITY'S OWN country — `country` above is merely
     * the first row in the table and need not be the one the test city sits
     * in. Getting that wrong makes the campaign inapplicable in the city and
     * the ranking assertion below vacuous. */
    const campaign = await createHeroPromotion(
      {
        scope: "COUNTRY",
        countryRef: ownCountry.slug,
        headline: `${MARKER} national campaign`,
        priorityTier: "FEATURED",
        endsAt,
      },
      ACTOR,
      GLOBAL_SCOPE,
    )
    created.push(campaign.id)
    /* Created after the bulk image assignment above, so it needs its own —
     * publish refuses a promotion with no image, deliberately. */
    await prisma.heroPromotion.update({
      where: { id: campaign.id },
      data: { imageKey: "marketing/hero/smoke.webp", imageWidth: 1600, imageHeight: 1600 },
    })
    check("a FEATURED campaign with an end date is accepted", campaign.priorityTier === "FEATURED")
    check("the tier maps to its stored number", campaign.priority === 100)

    /* ── publish and resolve ────────────────────────────────────────────── */
    await publishHeroPromotion(globalPromo.id, {}, ACTOR, GLOBAL_SCOPE)
    await publishHeroPromotion(countryPromo.id, {}, ACTOR, GLOBAL_SCOPE)
    await publishHeroPromotion(cityPromo.id, {}, ACTOR, GLOBAL_SCOPE)

    const inCity = await resolveHeroPromotionFor({ cityId: city.id, countryId: city.countryId })
    check(
      "a visitor in the city gets the city promotion",
      inCity?.headline === cityPromo.headline,
    )

    /* THE CASE THE TIERS EXIST FOR. Under specificity-first ranking a national
     * campaign could never reach a city that had any promotion of its own — so
     * the busiest markets were the only ones to miss it. */
    await publishHeroPromotion(campaign.id, {}, ACTOR, GLOBAL_SCOPE)
    const duringCampaign = await resolveHeroPromotionFor({
      cityId: city.id,
      countryId: city.countryId,
    })
    check(
      "a FEATURED country campaign reaches a city that has its own promotion",
      duringCampaign?.headline === campaign.headline,
    )

    /* And withdrawing it hands the city straight back to its own promotion. */
    await archiveHeroPromotion(campaign.id, ACTOR, GLOBAL_SCOPE)
    const afterCampaign = await resolveHeroPromotionFor({
      cityId: city.id,
      countryId: city.countryId,
    })
    check(
      "once the campaign ends, the city promotion wins again",
      afterCampaign?.headline === cityPromo.headline,
    )

    const inCountry = await resolveHeroPromotionFor({ cityId: null, countryId: country.id })
    check(
      "elsewhere in the country, the country promotion",
      inCountry?.headline === countryPromo.headline,
    )

    /* Compared by HEADLINE, because the public payload carries no id — and
     * against `renamed`, not `globalPromo`, whose captured headline went stale
     * the moment the update above changed it. */
    const unknown = await resolveHeroPromotionFor({ cityId: null, countryId: null })
    /* The public payload is an allowlist, not the admin record. Asserted by
     * KEY SET so that a column added to the table later fails here rather than
     * being published to anonymous visitors unnoticed. */
    check(
      "the public payload exposes only the fields the hero renders",
      unknown !== null &&
        JSON.stringify(Object.keys(unknown).sort()) ===
          JSON.stringify(
            ["ctaHref", "ctaLabel", "eyebrow", "headline", "image", "subheadline"],
          ),
      unknown ? Object.keys(unknown).sort() : unknown,
    )
    check(
      "an unknown location gets the global default",
      unknown?.headline === renamed.headline,
    )

    if (otherCity) {
      const elsewhere = await resolveHeroPromotionFor({
        cityId: otherCity.id,
        countryId: "00000000-0000-0000-0000-000000000000",
      })
      check(
        "another city never sees this city's promotion",
        elsewhere?.headline === renamed.headline,
      )
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
    check(
      "a promotion whose window has not opened does not show",
      beforeWindow?.headline !== cityPromo.headline,
    )

    /* ── archive ────────────────────────────────────────────────────────── */
    const archived = await archiveHeroPromotion(countryPromo.id, ACTOR, GLOBAL_SCOPE)
    check("archives rather than deletes", archived.status === "ARCHIVED")
    check(
      "the archived row is still there",
      (await prisma.heroPromotion.count({ where: { id: countryPromo.id } })) === 1,
    )
    const afterArchive = await resolveHeroPromotionFor({ cityId: null, countryId: country.id })
    check(
      "an archived promotion stops resolving",
      afterArchive?.headline !== countryPromo.headline,
    )
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
