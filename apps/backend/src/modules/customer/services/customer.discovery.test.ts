import { describe, expect, it } from "vitest"
import {
  boundingBox,
  distanceTo,
  effectiveRadiusMeters,
  estimateDelivery,
  isOpenAt,
  localClock,
  parseHhMm,
  relevanceScore,
  sortOutlets,
  DEFAULT_DELIVERY_RADIUS_KM,
  MAX_DELIVERY_RADIUS_KM,
  FALLBACK_PREP_MIN,
  type RankableOutlet,
  type TradingDay,
} from "./customer.discovery"

// Nairobi CBD, and a point about 2.2 km away.
const CBD  = { latitude: -1.2864, longitude: 36.8172 }
const NEAR = { latitude: -1.2680, longitude: 36.8100 }

describe("effectiveRadiusMeters", () => {
  it("uses the outlet's own radius when it has one", () => {
    expect(effectiveRadiusMeters(4)).toBe(4_000)
  })

  it("falls back to the platform default when unset", () => {
    expect(effectiveRadiusMeters(null)).toBe(DEFAULT_DELIVERY_RADIUS_KM * 1000)
    expect(effectiveRadiusMeters(undefined)).toBe(DEFAULT_DELIVERY_RADIUS_KM * 1000)
  })

  it("treats zero as unset rather than as 'delivers nowhere'", () => {
    // A zero radius would otherwise make the outlet invisible from every
    // address, which is never what a zero in this column means.
    expect(effectiveRadiusMeters(0)).toBe(DEFAULT_DELIVERY_RADIUS_KM * 1000)
  })

  it("clamps an implausible radius", () => {
    expect(effectiveRadiusMeters(5_000)).toBe(MAX_DELIVERY_RADIUS_KM * 1000)
  })
})

describe("boundingBox", () => {
  it("contains every point inside the radius", () => {
    const radius = 5_000
    const box = boundingBox(CBD, radius)

    // Sample the circle at 8 bearings; each must fall inside the box.
    for (let bearing = 0; bearing < 360; bearing += 45) {
      const rad = (bearing * Math.PI) / 180
      const dLat = (radius * Math.cos(rad)) / 111_320
      const dLng = (radius * Math.sin(rad)) / (111_320 * Math.cos((CBD.latitude * Math.PI) / 180))
      const lat = CBD.latitude + dLat
      const lng = CBD.longitude + dLng

      expect(lat).toBeGreaterThanOrEqual(box.minLat)
      expect(lat).toBeLessThanOrEqual(box.maxLat)
      expect(lng).toBeGreaterThanOrEqual(box.minLng)
      expect(lng).toBeLessThanOrEqual(box.maxLng)
    }
  })

  it("is a superset, never a near-miss — a point ON the radius is inside", () => {
    const radius = 3_000
    const box = boundingBox(CBD, radius)
    const due_north = { latitude: CBD.latitude + radius / 111_320, longitude: CBD.longitude }
    expect(due_north.latitude).toBeLessThanOrEqual(box.maxLat)
  })

  it("stays within legal latitude bounds near a pole", () => {
    const box = boundingBox({ latitude: 89.5, longitude: 0 }, 200_000)
    expect(box.maxLat).toBeLessThanOrEqual(90)
    expect(box.minLat).toBeGreaterThanOrEqual(-90)
  })

  it("widens to the whole longitude range rather than wrapping past the antimeridian", () => {
    const box = boundingBox({ latitude: 0, longitude: 179.9 }, 100_000)
    expect(box.maxLng).toBeLessThanOrEqual(180)
    expect(box.minLng).toBeGreaterThanOrEqual(-180)
  })
})

describe("distanceTo", () => {
  it("measures a short urban hop plausibly", () => {
    const metres = distanceTo(CBD, NEAR)
    expect(metres).toBeGreaterThan(1_500)
    expect(metres).toBeLessThan(3_000)
  })

  it("is zero for the same point", () => {
    expect(distanceTo(CBD, CBD)).toBeCloseTo(0, 5)
  })
})

describe("estimateDelivery", () => {
  it("grows with distance", () => {
    const near = estimateDelivery(1_000, 15)
    const far  = estimateDelivery(9_000, 15)
    expect(far.minMinutes).toBeGreaterThan(near.minMinutes)
  })

  it("grows with prep time", () => {
    const quick = estimateDelivery(3_000, 10)
    const slow  = estimateDelivery(3_000, 45)
    expect(slow.maxMinutes - quick.maxMinutes).toBe(35)
  })

  it("uses a conservative fallback when the outlet declared no prep time", () => {
    expect(estimateDelivery(3_000, null)).toEqual(estimateDelivery(3_000, FALLBACK_PREP_MIN))
  })

  it("never promises an implausibly fast delivery", () => {
    const instant = estimateDelivery(0, 1)
    expect(instant.minMinutes).toBeGreaterThanOrEqual(5)
    expect(instant.maxMinutes).toBeGreaterThanOrEqual(10)
  })

  it("returns a range, always min before max", () => {
    const eta = estimateDelivery(4_200, 22)
    expect(eta.minMinutes).toBeLessThan(eta.maxMinutes)
  })
})

describe("parseHhMm", () => {
  it("reads a valid time", () => {
    expect(parseHhMm("08:30")).toBe(510)
    expect(parseHhMm("00:00")).toBe(0)
    expect(parseHhMm("23:59")).toBe(1439)
  })

  it("refuses anything that is not HH:mm", () => {
    for (const bad of ["8:30", "0830", "24:00", "12:60", "", null, undefined, "noon"]) {
      expect(parseHhMm(bad as string)).toBeNull()
    }
  })
})

describe("localClock", () => {
  it("resolves wall-clock time in the outlet's own zone, not the server's", () => {
    // 2026-09-14 is a Monday. 22:30 UTC is already Tuesday 01:30 in Nairobi.
    const instant = new Date("2026-09-14T22:30:00Z")

    expect(localClock(instant, "UTC")).toMatchObject({ dayIndex: 1, day: "MONDAY", minutes: 22 * 60 + 30 })
    expect(localClock(instant, "Africa/Nairobi")).toMatchObject({ dayIndex: 2, day: "TUESDAY", minutes: 90 })
  })

  it("falls back to UTC on an unknown zone rather than throwing", () => {
    const instant = new Date("2026-09-14T10:00:00Z")
    expect(localClock(instant, "Not/AZone")).toEqual(localClock(instant, "UTC"))
  })
})

describe("isOpenAt", () => {
  const week = (over: Partial<Record<string, Partial<TradingDay>>> = {}): TradingDay[] =>
    ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].map((day) => ({
      dayOfWeek: day,
      openTime : "08:00",
      closeTime: "22:00",
      isClosed : false,
      ...(over[day] ?? {}),
    }))

  // Monday in Nairobi (UTC+3).
  const mondayLocal = (hhmm: string) =>
    new Date(`2026-09-14T${String(Number(hhmm.slice(0, 2)) - 3).padStart(2, "0")}:${hhmm.slice(3)}:00Z`)

  it("is open inside the day's window", () => {
    expect(isOpenAt(week(), mondayLocal("12:00"), "Africa/Nairobi")).toBe(true)
  })

  it("is shut before opening and after closing", () => {
    expect(isOpenAt(week(), mondayLocal("07:00"), "Africa/Nairobi")).toBe(false)
    expect(isOpenAt(week(), mondayLocal("23:00"), "Africa/Nairobi")).toBe(false)
  })

  it("is shut on an explicitly closed day", () => {
    expect(isOpenAt(week({ MONDAY: { isClosed: true } }), mondayLocal("12:00"), "Africa/Nairobi")).toBe(false)
  })

  it("handles an overnight window on the day it opened", () => {
    const late = week({ MONDAY: { openTime: "18:00", closeTime: "02:00" } })
    expect(isOpenAt(late, mondayLocal("20:00"), "Africa/Nairobi")).toBe(true)
    expect(isOpenAt(late, mondayLocal("12:00"), "Africa/Nairobi")).toBe(false)
  })

  it("stays open past midnight on YESTERDAY's overnight window", () => {
    // The case that gets forgotten: at 01:00 Tuesday the open window belongs to
    // Monday's row, and Tuesday's own row has not opened yet.
    const hours = week({
      MONDAY : { openTime: "18:00", closeTime: "02:00" },
      TUESDAY: { openTime: "18:00", closeTime: "02:00" },
    })
    const tuesday0100Nairobi = new Date("2026-09-14T22:00:00Z")
    expect(localClock(tuesday0100Nairobi, "Africa/Nairobi").dayIndex).toBe(2)
    expect(isOpenAt(hours, tuesday0100Nairobi, "Africa/Nairobi")).toBe(true)
  })

  it("does NOT stay open past midnight when yesterday closed normally", () => {
    const tuesday0100Nairobi = new Date("2026-09-14T22:00:00Z")
    expect(isOpenAt(week(), tuesday0100Nairobi, "Africa/Nairobi")).toBe(false)
  })

  it("treats an outlet with no hours set as open", () => {
    // Hours are optional and most outlets have not set them; hiding every such
    // outlet would empty the feed over a field nobody filled in.
    expect(isOpenAt([], mondayLocal("03:00"), "Africa/Nairobi")).toBe(true)
  })

  it("is shut when the stored times are malformed", () => {
    const broken = week({ MONDAY: { openTime: "oops", closeTime: "22:00" } })
    expect(isOpenAt(broken, mondayLocal("12:00"), "Africa/Nairobi")).toBe(false)
  })
})

describe("relevanceScore and sortOutlets", () => {
  const outlet = (over: Partial<RankableOutlet> = {}): RankableOutlet => ({
    id            : "a",
    distanceMeters: 2_000,
    rating        : 4.5,
    reviewCount   : 50,
    etaMaxMinutes : 35,
    isOpenNow     : true,
    hasOffer      : false,
    isFeatured    : false,
    ...over,
  })

  it("prefers nearer over further, all else equal", () => {
    expect(relevanceScore(outlet({ distanceMeters: 1_000 })))
      .toBeLessThan(relevanceScore(outlet({ distanceMeters: 6_000 })))
  })

  it("prefers better rated over worse, all else equal", () => {
    expect(relevanceScore(outlet({ rating: 4.9 })))
      .toBeLessThan(relevanceScore(outlet({ rating: 3.1 })))
  })

  it("ignores a rating backed by too few reviews", () => {
    // A lone five-star review must not outrank a well-reviewed 4.5.
    const noisy   = outlet({ id: "noisy", rating: 5, reviewCount: 1 })
    const trusted = outlet({ id: "trusted", rating: 4.5, reviewCount: 200 })
    expect(relevanceScore(trusted)).toBeLessThan(relevanceScore(noisy))
  })

  it("sinks a closed outlet below every open one whatever else it has", () => {
    const shutAndPerfect = outlet({ id: "shut", isOpenNow: false, distanceMeters: 50, rating: 5, isFeatured: true })
    const openAndPlain   = outlet({ id: "open", distanceMeters: 9_000, rating: 3, reviewCount: 5 })
    expect(relevanceScore(openAndPlain)).toBeLessThan(relevanceScore(shutAndPerfect))
  })

  it("does not let featured placement beat a much nearer outlet", () => {
    const featuredFar = outlet({ id: "far", distanceMeters: 9_000, isFeatured: true })
    const plainNear   = outlet({ id: "near", distanceMeters: 500 })
    expect(relevanceScore(plainNear)).toBeLessThan(relevanceScore(featuredFar))
  })

  it("every sort puts open outlets first", () => {
    const rows = [
      outlet({ id: "shut", isOpenNow: false, distanceMeters: 100, rating: 5, reviewCount: 99, etaMaxMinutes: 10 }),
      outlet({ id: "open", distanceMeters: 8_000, rating: 3.2, reviewCount: 40, etaMaxMinutes: 70 }),
    ]
    for (const sort of ["RELEVANCE", "DISTANCE", "RATING", "DELIVERY_TIME"] as const) {
      expect(sortOutlets(rows, sort)[0]!.id).toBe("open")
    }
  })

  it("sorts an unrated outlet last by rating, not first", () => {
    const unrated = outlet({ id: "unrated", rating: 0, reviewCount: 0 })
    const rated   = outlet({ id: "rated", rating: 3.0, reviewCount: 30 })
    expect(sortOutlets([unrated, rated], "RATING").map((o) => o.id)).toEqual(["rated", "unrated"])
  })

  it("breaks ties on id so paging is stable", () => {
    const a = outlet({ id: "aaa" })
    const b = outlet({ id: "bbb" })
    expect(sortOutlets([b, a], "DISTANCE").map((o) => o.id)).toEqual(["aaa", "bbb"])
    expect(sortOutlets([a, b], "DISTANCE").map((o) => o.id)).toEqual(["aaa", "bbb"])
  })

  it("does not mutate the input", () => {
    const rows = [outlet({ id: "z", distanceMeters: 9_000 }), outlet({ id: "a", distanceMeters: 100 })]
    const before = rows.map((r) => r.id)
    sortOutlets(rows, "DISTANCE")
    expect(rows.map((r) => r.id)).toEqual(before)
  })
})
