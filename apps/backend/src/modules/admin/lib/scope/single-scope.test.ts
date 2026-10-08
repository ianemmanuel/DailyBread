import { describe, it, expect } from "vitest"
import { ApiError } from "@/middleware/error"
import { deriveScopeContext, assertSingleScopeShape, NO_SCOPE, type StoredScopeRow } from "./single-scope"
import { listingInScope } from "@/modules/meals/lib/listings.rules"
import { canActDishWide, dishInReadScope } from "@/modules/meals/lib/moderation.rules"

const row = (r: Partial<StoredScopeRow> & Pick<StoredScopeRow, "scopeType">): StoredScopeRow =>
  ({ countryId: null, cityId: null, cityCountryId: null, ...r })

const GLOBAL  = row({ scopeType: "GLOBAL" })
const KENYA   = row({ scopeType: "COUNTRY", countryId: "ke" })
const NAIROBI = row({ scopeType: "CITY", cityId: "nbo", countryId: "ke", cityCountryId: "ke" })
const KAMPALA = row({ scopeType: "CITY", cityId: "kla", countryId: "ug", cityCountryId: "ug" })

function code(fn: () => unknown): string | undefined {
  try { fn(); return undefined } catch (e) { return e instanceof ApiError ? e.code : "NOT_API_ERROR" }
}

describe("deriveScopeContext — exactly one well-formed scope", () => {
  it("GLOBAL, COUNTRY and CITY each derive their own tier", () => {
    expect(deriveScopeContext([GLOBAL]).scope).toEqual({ isGlobal: true, countryIds: [], cityIds: [], tier: "GLOBAL" })
    expect(deriveScopeContext([KENYA]).scope).toEqual({ isGlobal: false, countryIds: ["ke"], cityIds: [], tier: "COUNTRY" })
    expect(deriveScopeContext([NAIROBI]).scope).toEqual({ isGlobal: false, countryIds: ["ke"], cityIds: ["nbo"], tier: "CITY" })
  })

  it("a CITY scope's country is the CITY's, never the stored column", () => {
    // Stored "ke" on a Kampala row — the shape a forged request used to write.
    const forged = row({ scopeType: "CITY", cityId: "kla", countryId: "ke", cityCountryId: "ug" })
    expect(deriveScopeContext([forged]).scope.countryIds).toEqual(["ug"])
  })

  it("COUNTRY + CITY is NOT a union — it fails closed to no scope", () => {
    const { scope, valid } = deriveScopeContext([KENYA, KAMPALA])
    expect(valid).toBe(false)
    expect(scope).toEqual(NO_SCOPE)
    expect(scope.tier).toBe("CITY")
    expect(scope.countryIds).toEqual([])
  })

  it("GLOBAL beside anything else does not become global", () => {
    expect(deriveScopeContext([GLOBAL, KENYA]).scope.isGlobal).toBe(false)
  })

  it("no rows, or a malformed row, is no scope", () => {
    expect(deriveScopeContext([]).valid).toBe(false)
    expect(deriveScopeContext([row({ scopeType: "COUNTRY" })]).valid).toBe(false)
    expect(deriveScopeContext([row({ scopeType: "COUNTRY", countryId: "ke", cityId: "nbo" })]).valid).toBe(false)
    expect(deriveScopeContext([row({ scopeType: "GLOBAL", countryId: "ke" })]).valid).toBe(false)
    expect(deriveScopeContext([row({ scopeType: "CITY", cityId: "nbo" })]).valid).toBe(false) // city unreadable
  })
})

describe("the derived scope, applied to Meals", () => {
  const nairobiListing = { countryId: "ke", cityId: "nbo" }
  const mombasaListing = { countryId: "ke", cityId: "mba" }
  const kampalaListing = { countryId: "ug", cityId: "kla" }
  const of = (...rows: StoredScopeRow[]) => deriveScopeContext(rows).scope

  it("CITY acts in its own city only, and never dish-wide", () => {
    const city = of(NAIROBI)
    expect(listingInScope(city, nairobiListing)).toBe(true)
    expect(listingInScope(city, mombasaListing)).toBe(false)
    expect(listingInScope(city, kampalaListing)).toBe(false)
    expect(canActDishWide(city)).toBe(false)
  })

  it("COUNTRY acts across its country, dish-wide there, and nowhere else", () => {
    const country = of(KENYA)
    expect(listingInScope(country, mombasaListing)).toBe(true)
    expect(listingInScope(country, kampalaListing)).toBe(false)
    expect(canActDishWide(country)).toBe(true)
    expect(dishInReadScope(country, { countryId: "ug", outletCityIds: ["kla"] })).toBe(false)
  })

  it("GLOBAL acts everywhere", () => {
    const global = of(GLOBAL)
    expect(listingInScope(global, kampalaListing)).toBe(true)
    expect(canActDishWide(global)).toBe(true)
  })

  it("mixed scopes reach NOTHING — not the city, not either country, not dish-wide", () => {
    const mixed = of(KENYA, KAMPALA)
    for (const l of [nairobiListing, mombasaListing, kampalaListing]) expect(listingInScope(mixed, l)).toBe(false)
    expect(dishInReadScope(mixed, { countryId: "ke", outletCityIds: ["nbo"] })).toBe(false)
    expect(canActDishWide(mixed)).toBe(false)
  })
})

describe("assertSingleScopeShape — what an assignment may request", () => {
  it("accepts exactly one well-formed scope", () => {
    expect(assertSingleScopeShape([{ scopeType: "GLOBAL" }])).toEqual({ scopeType: "GLOBAL" })
    expect(assertSingleScopeShape([{ scopeType: "COUNTRY", countryId: "ke" }])).toEqual({ scopeType: "COUNTRY", countryId: "ke" })
    expect(assertSingleScopeShape([{ scopeType: "CITY", cityId: "nbo" }])).toEqual({ scopeType: "CITY", cityId: "nbo" })
  })
  it("refuses zero or several", () => {
    expect(code(() => assertSingleScopeShape([]))).toBe("SINGLE_SCOPE_REQUIRED")
    expect(code(() => assertSingleScopeShape(undefined))).toBe("SINGLE_SCOPE_REQUIRED")
    expect(code(() => assertSingleScopeShape([{ scopeType: "COUNTRY", countryId: "ke" }, { scopeType: "CITY", cityId: "kla" }])))
      .toBe("SINGLE_SCOPE_REQUIRED")
  })
  it("refuses a malformed shape", () => {
    expect(code(() => assertSingleScopeShape([{ scopeType: "GLOBAL", countryId: "ke" }]))).toBe("INVALID_SCOPE_SHAPE")
    expect(code(() => assertSingleScopeShape([{ scopeType: "COUNTRY" }]))).toBe("INVALID_SCOPE_SHAPE")
    expect(code(() => assertSingleScopeShape([{ scopeType: "COUNTRY", countryId: "ke", cityId: "nbo" }]))).toBe("INVALID_SCOPE_SHAPE")
    expect(code(() => assertSingleScopeShape([{ scopeType: "CITY" }]))).toBe("INVALID_SCOPE_SHAPE")
  })
})
