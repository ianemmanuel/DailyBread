import { describe, expect, it } from "vitest"

import { HeroPromotionPriority } from "@repo/types/enums"

import {
  HERO_ORIGINAL_PREFIX,
  HERO_PUBLIC_PREFIX,
  assertHeroOriginalKey,
  assertHeroPublicKey,
  assertPriorityWindow,
  assertScopeShape,
  assertWindowNotElapsed,
  buildHeroOriginalKey,
  buildHeroPublicKey,
  resolveHeroPromotion,
  type ScopedCandidate,
} from "./heroPromotion.rules"

const candidate = (over: Partial<ScopedCandidate> & Pick<ScopedCandidate, "scope">): ScopedCandidate => ({
  cityId: null,
  countryId: null,
  priority: 0,
  publishedAt: null,
  ...over,
})

describe("storage keys", () => {
  it("builds one segment under the expected prefix", () => {
    expect(buildHeroOriginalKey("jpg")).toMatch(
      new RegExp(`^${HERO_ORIGINAL_PREFIX}/[0-9a-f-]{36}\\.jpg$`),
    )
    expect(buildHeroPublicKey()).toMatch(new RegExp(`^${HERO_PUBLIC_PREFIX}/[0-9a-f-]{36}\\.webp$`))
  })

  it("gives every processed image a fresh key, so objects stay immutable", () => {
    expect(buildHeroPublicKey()).not.toBe(buildHeroPublicKey())
  })

  it("accepts a key it produced itself", () => {
    const key = buildHeroOriginalKey("png")
    expect(assertHeroOriginalKey(key)).toBe(key)
  })

  /*
   * The point of the guard: without it, "process this key" would copy any
   * object in the private bucket into the PUBLIC one. Each case below is a way
   * an attacker would try to name someone else's file.
   */
  it.each([
    ["a payout proof", "payout-docs/bank-account/v1/secret.pdf"],
    ["an identity document", "vendors/v1/documents/dt1/passport.jpg"],
    ["traversal out of the prefix", `${HERO_ORIGINAL_PREFIX}/../../payout-docs/x.pdf`],
    ["a nested path", `${HERO_ORIGINAL_PREFIX}/nested/x.jpg`],
    ["a prefix collision", `${HERO_ORIGINAL_PREFIX}-evil/x.jpg`],
    ["the bare prefix", `${HERO_ORIGINAL_PREFIX}/`],
    ["a double slash", `${HERO_ORIGINAL_PREFIX}//x.jpg`],
    ["an empty string", ""],
  ])("refuses %s", (_label, key) => {
    expect(() => assertHeroOriginalKey(key)).toThrowError()
  })

  it.each([null, undefined, 42, {}])("refuses non-string key %p", (key) => {
    expect(() => assertHeroOriginalKey(key)).toThrowError()
  })

  it("keeps the two prefixes apart", () => {
    expect(() => assertHeroPublicKey(buildHeroOriginalKey("jpg"))).toThrowError()
    expect(() => assertHeroOriginalKey(buildHeroPublicKey())).toThrowError()
  })
})

describe("resolveHeroPromotion", () => {
  const perth = { cityId: "perth", countryId: "au" }

  it("prefers the city over the country and the global default", () => {
    const winner = resolveHeroPromotion(
      [
        candidate({ scope: "GLOBAL" }),
        candidate({ scope: "COUNTRY", countryId: "au" }),
        candidate({ scope: "CITY", cityId: "perth" }),
      ],
      perth,
    )
    expect(winner?.scope).toBe("CITY")
  })

  it("falls back to the country when the city has none", () => {
    const winner = resolveHeroPromotion(
      [candidate({ scope: "GLOBAL" }), candidate({ scope: "COUNTRY", countryId: "au" })],
      perth,
    )
    expect(winner?.scope).toBe("COUNTRY")
  })

  it("falls back to global when neither city nor country has one", () => {
    expect(resolveHeroPromotion([candidate({ scope: "GLOBAL" })], perth)?.scope).toBe("GLOBAL")
  })

  it("returns null when nothing applies", () => {
    expect(resolveHeroPromotion([candidate({ scope: "CITY", cityId: "berlin" })], perth)).toBeNull()
  })

  /* The requirement in one test: Perth must never see Berlin's promotion, and
   * two cities in one country can differ. */
  it("never leaks another city's promotion", () => {
    const berlin = candidate({ scope: "CITY", cityId: "berlin" })
    const sydney = candidate({ scope: "CITY", cityId: "sydney" })
    const au = candidate({ scope: "COUNTRY", countryId: "au" })

    expect(resolveHeroPromotion([berlin, sydney, au], perth)?.scope).toBe("COUNTRY")
    expect(resolveHeroPromotion([berlin, sydney, au], { cityId: "sydney", countryId: "au" })).toBe(
      sydney,
    )
  })

  it("never leaks another country's promotion", () => {
    const de = candidate({ scope: "COUNTRY", countryId: "de" })
    expect(resolveHeroPromotion([de], perth)).toBeNull()
  })

  it("matches nothing city-scoped when the visitor's city is unknown", () => {
    const winner = resolveHeroPromotion(
      [candidate({ scope: "CITY", cityId: "perth" }), candidate({ scope: "GLOBAL" })],
      { cityId: null, countryId: null },
    )
    expect(winner?.scope).toBe("GLOBAL")
  })

  it("breaks ties inside a scope by priority, then by newest", () => {
    const low = candidate({ scope: "GLOBAL", priority: 1, publishedAt: new Date("2026-01-01") })
    const high = candidate({ scope: "GLOBAL", priority: 9, publishedAt: new Date("2025-01-01") })
    expect(resolveHeroPromotion([low, high], perth)).toBe(high)

    const older = candidate({ scope: "GLOBAL", priority: 5, publishedAt: new Date("2025-01-01") })
    const newer = candidate({ scope: "GLOBAL", priority: 5, publishedAt: new Date("2026-06-01") })
    expect(resolveHeroPromotion([older, newer], perth)).toBe(newer)
  })

  /*
   * PRIORITY OUTRANKS SPECIFICITY. These are the cases the whole tier design
   * exists for, and the first one is the bug it fixes: under specificity-first
   * a national campaign could never reach a city that had any promotion of its
   * own, so the busiest markets were the only ones to miss it.
   */
  it("lets a FEATURED country campaign beat an ordinary city promotion", () => {
    const city = candidate({
      scope: "CITY",
      cityId: "perth",
      priority: HeroPromotionPriority.STANDARD,
    })
    const campaign = candidate({
      scope: "COUNTRY",
      countryId: "au",
      priority: HeroPromotionPriority.FEATURED,
    })
    expect(resolveHeroPromotion([city, campaign], perth)).toBe(campaign)
  })

  it("lets a GLOBAL takeover beat both", () => {
    const city = candidate({ scope: "CITY", cityId: "perth", priority: HeroPromotionPriority.STANDARD })
    const country = candidate({
      scope: "COUNTRY",
      countryId: "au",
      priority: HeroPromotionPriority.FEATURED,
    })
    const takeover = candidate({ scope: "GLOBAL", priority: HeroPromotionPriority.TAKEOVER })
    expect(resolveHeroPromotion([city, country, takeover], perth)).toBe(takeover)
  })

  it("lets a city out-rank a global takeover by matching its tier", () => {
    const takeover = candidate({ scope: "GLOBAL", priority: HeroPromotionPriority.TAKEOVER })
    const cityTakeover = candidate({
      scope: "CITY",
      cityId: "perth",
      priority: HeroPromotionPriority.TAKEOVER,
    })
    /* Equal priority falls through to specificity, so the local one wins —
     * the escape hatch for a market that must keep its own hero. */
    expect(resolveHeroPromotion([takeover, cityTakeover], perth)).toBe(cityTakeover)
  })

  it("still prefers the city when everything is STANDARD", () => {
    const city = candidate({ scope: "CITY", cityId: "perth", priority: HeroPromotionPriority.STANDARD })
    const country = candidate({
      scope: "COUNTRY",
      countryId: "au",
      priority: HeroPromotionPriority.STANDARD,
    })
    const global = candidate({ scope: "GLOBAL", priority: HeroPromotionPriority.STANDARD })
    /* Every row written before tiers existed is 0, so this is the behaviour
     * they keep: the change is backward-compatible by construction. */
    expect(resolveHeroPromotion([global, country, city], perth)).toBe(city)
  })

  it("never lets priority defeat TARGETING", () => {
    /* Ranking only ever chooses among promotions that already apply here. A
     * takeover aimed at Berlin must not reach Perth at any priority. */
    const berlin = candidate({
      scope: "CITY",
      cityId: "berlin",
      priority: HeroPromotionPriority.TAKEOVER,
    })
    const global = candidate({ scope: "GLOBAL", priority: HeroPromotionPriority.STANDARD })
    expect(resolveHeroPromotion([berlin, global], perth)).toBe(global)
  })
})

describe("assertPriorityWindow", () => {
  it("lets a STANDARD promotion run until it is replaced", () => {
    expect(() => assertPriorityWindow("STANDARD", null)).not.toThrow()
  })

  it.each(["FEATURED", "TAKEOVER"] as const)(
    "refuses a %s promotion with no end date",
    (tier) => {
      /* The Christmas-runs-until-May guard. */
      expect(() => assertPriorityWindow(tier, null)).toThrowError(/end date/i)
    },
  )

  it.each(["FEATURED", "TAKEOVER"] as const)("accepts a %s promotion that ends", (tier) => {
    expect(() => assertPriorityWindow(tier, new Date("2026-12-26"))).not.toThrow()
  })
})

describe("assertWindowNotElapsed", () => {
  const now = new Date("2026-06-01")

  it("accepts no end date at all", () => {
    expect(() => assertWindowNotElapsed(null, now)).not.toThrow()
  })

  it("accepts an end date in the future", () => {
    expect(() => assertWindowNotElapsed(new Date("2026-06-02"), now)).not.toThrow()
  })

  it.each([
    ["already past", new Date("2026-05-31")],
    ["exactly now", new Date("2026-06-01")],
  ])("refuses an end date %s", (_label, endsAt) => {
    expect(() => assertWindowNotElapsed(endsAt, now)).toThrowError()
  })
})

describe("assertScopeShape", () => {
  it("accepts a coherent scope", () => {
    expect(() => assertScopeShape("CITY", { cityId: "perth", countryId: "au" })).not.toThrow()
    expect(() => assertScopeShape("COUNTRY", { cityId: null, countryId: "au" })).not.toThrow()
    expect(() => assertScopeShape("GLOBAL", { cityId: null, countryId: null })).not.toThrow()
  })

  /* Each of these would produce a row that resolution silently never matches,
   * or matches far too widely. */
  it("refuses a city promotion with no city", () => {
    expect(() => assertScopeShape("CITY", { cityId: null, countryId: "au" })).toThrowError()
  })

  it("refuses a country promotion with no country", () => {
    expect(() => assertScopeShape("COUNTRY", { cityId: null, countryId: null })).toThrowError()
  })

  it("refuses a country promotion that also names a city", () => {
    expect(() => assertScopeShape("COUNTRY", { cityId: "perth", countryId: "au" })).toThrowError()
  })

  it("refuses a global promotion that names anywhere", () => {
    expect(() => assertScopeShape("GLOBAL", { cityId: null, countryId: "au" })).toThrowError()
    expect(() => assertScopeShape("GLOBAL", { cityId: "perth", countryId: null })).toThrowError()
  })
})
