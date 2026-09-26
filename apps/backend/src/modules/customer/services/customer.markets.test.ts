import { describe, expect, it } from "vitest"
import { resolveCustomerMarkets, type OperatingCityInfo } from "./customer.markets"

const city = (id: string, name: string): OperatingCityInfo =>
  ({ id, slug: `${name.toLowerCase()}-ke`, name, countryId: "ke" })

const cities = new Map([
  ["nbo", city("nbo", "Nairobi")],
  ["mba", city("mba", "Mombasa")],
])

const at = (day: number) => new Date(Date.UTC(2026, 0, day))

describe("resolveCustomerMarkets", () => {
  it("returns nothing for a customer with no choices and no addresses", () => {
    const result = resolveCustomerMarkets({ rows: [], addresses: [], cities })
    expect(result.markets).toEqual([])
    expect(result.defaultCityId).toBeNull()
  })

  it("honours an explicit default address while it still resolves into the city", () => {
    const result = resolveCustomerMarkets({
      rows     : [{ cityId: "nbo", isDefault: false, defaultAddressId: "old", lastSelectedAt: at(1) }],
      addresses: [
        { id: "old", cityId: "nbo", createdAt: at(1) },
        { id: "new", cityId: "nbo", createdAt: at(2) },
      ],
      cities,
    })
    expect(result.defaultAddressByCity.get("nbo")).toBe("old")
  })

  it("ignores a claimed default whose pin now resolves elsewhere, falling back to the newest address", () => {
    const result = resolveCustomerMarkets({
      rows     : [{ cityId: "nbo", isDefault: false, defaultAddressId: "moved", lastSelectedAt: at(1) }],
      addresses: [
        { id: "moved", cityId: "mba", createdAt: at(3) },
        { id: "a", cityId: "nbo", createdAt: at(1) },
        { id: "b", cityId: "nbo", createdAt: at(2) },
      ],
      cities,
    })
    expect(result.defaultAddressByCity.get("nbo")).toBe("b")
    /* Mombasa has no row but has an address, so it is one of your cities. */
    expect(result.defaultAddressByCity.get("mba")).toBe("moved")
  })

  it("keeps defaults per city — one city's default never displaces another's", () => {
    const result = resolveCustomerMarkets({
      rows: [
        { cityId: "nbo", isDefault: true, defaultAddressId: "home", lastSelectedAt: at(1) },
        { cityId: "mba", isDefault: false, defaultAddressId: "beach", lastSelectedAt: at(2) },
      ],
      addresses: [
        { id: "home", cityId: "nbo", createdAt: at(1) },
        { id: "work", cityId: "nbo", createdAt: at(5) },
        { id: "beach", cityId: "mba", createdAt: at(2) },
      ],
      cities,
    })
    expect(result.defaultAddressByCity.get("nbo")).toBe("home")
    expect(result.defaultAddressByCity.get("mba")).toBe("beach")
  })

  it("an explicit default city beats a more recent selection", () => {
    const result = resolveCustomerMarkets({
      rows: [
        { cityId: "nbo", isDefault: true, defaultAddressId: null, lastSelectedAt: at(1) },
        { cityId: "mba", isDefault: false, defaultAddressId: null, lastSelectedAt: at(9) },
      ],
      addresses: [],
      cities,
    })
    expect(result.defaultCityId).toBe("nbo")
    expect(result.markets.map((m) => m.citySlug)).toEqual(["nairobi-ke", "mombasa-ke"])
  })

  it("without an explicit default city, the most recently selected city is the default", () => {
    const result = resolveCustomerMarkets({
      rows: [
        { cityId: "nbo", isDefault: false, defaultAddressId: null, lastSelectedAt: at(1) },
        { cityId: "mba", isDefault: false, defaultAddressId: null, lastSelectedAt: at(9) },
      ],
      addresses: [],
      cities,
    })
    expect(result.defaultCityId).toBe("mba")
    expect(result.markets[0]).toMatchObject({ citySlug: "mombasa-ke", isDefault: true })
  })

  it("with no market rows at all, the newest address's city is the default", () => {
    const result = resolveCustomerMarkets({
      rows     : [],
      addresses: [
        { id: "a", cityId: "nbo", createdAt: at(1) },
        { id: "b", cityId: "mba", createdAt: at(2) },
      ],
      cities,
    })
    expect(result.defaultCityId).toBe("mba")
  })

  it("drops a city that no longer operates, even when it was the explicit default", () => {
    const result = resolveCustomerMarkets({
      rows: [
        { cityId: "closed", isDefault: true, defaultAddressId: null, lastSelectedAt: at(9) },
        { cityId: "nbo", isDefault: false, defaultAddressId: null, lastSelectedAt: at(1) },
      ],
      addresses: [{ id: "x", cityId: "closed", createdAt: at(1) }],
      cities,
    })
    expect(result.markets.map((m) => m.cityId)).toEqual(["nbo"])
    expect(result.defaultCityId).toBe("nbo")
  })

  it("counts addresses per city and reports a city chosen without any address", () => {
    const result = resolveCustomerMarkets({
      rows     : [{ cityId: "mba", isDefault: false, defaultAddressId: null, lastSelectedAt: at(1) }],
      addresses: [{ id: "a", cityId: "nbo", createdAt: at(1) }, { id: "b", cityId: "nbo", createdAt: at(2) }],
      cities,
    })
    const byCity = Object.fromEntries(result.markets.map((m) => [m.cityId, m]))
    expect(byCity.nbo).toMatchObject({ addressCount: 2, defaultAddressId: "b", lastSelectedAt: null })
    expect(byCity.mba).toMatchObject({ addressCount: 0, defaultAddressId: null })
  })
})
