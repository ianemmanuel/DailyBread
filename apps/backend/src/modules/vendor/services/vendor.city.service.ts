import { prisma } from "@repo/db"
import { ApiError } from "@/middleware/error"
import type { CityCoverage, CityCoverageZone, OutletPlacement } from "@repo/types/backend"
import type { ZoneBoundary } from "@repo/types/backend"
import { resolveCapabilitiesForPoint } from "./vendor.geography.service"
import { describePlacement, zoneCoverageStatus } from "./vendor.placement"

/*
 * The vendor's read-only window onto operational geography: which cities they
 * may register an outlet in, what the platform covers inside one of them, and
 * what a specific pin would mean.
 *
 * Everything here is scoped to the vendor's own registered country
 * (VendorAccount.countryId is set at approval and never changes) and to ACTIVE
 * cities. The outlet create path (vendor.outlet.service.createOutlet)
 * re-validates all of it and remains authoritative — these endpoints exist so
 * the vendor learns the answer while placing the pin instead of after
 * submitting the form.
 */

export interface VendorCityOption {
  id  : string
  name: string
  code: string | null
}

export async function listActiveCitiesForVendor(vendorId: string): Promise<VendorCityOption[]> {
  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { countryId: true },
  })
  if (!vendor) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")

  return prisma.city.findMany({
    where  : { countryId: vendor.countryId, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select : { id: true, name: true, code: true },
  })
}

/*
 * Country + active-city guard shared by both geography reads below. A city in
 * another country reads as 404, not 403 — a vendor has no business learning
 * that a city id they guessed exists somewhere outside their own market.
 *
 * Zone polygons are deliberately not selected here: the preview path calls
 * this on every pin move and only needs the city to exist, while the coverage
 * path fetches the geometry once per city. Loading every polygon on both would
 * make the cheap call as expensive as the expensive one.
 */
async function assertCityAvailableToVendor(vendorId: string, cityId: string): Promise<string> {
  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { countryId: true },
  })
  if (!vendor) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")

  const city = await prisma.city.findFirst({
    where : { id: cityId, countryId: vendor.countryId, status: "ACTIVE" },
    select: { id: true },
  })
  if (!city) throw new ApiError(404, "City not found", "NOT_FOUND")

  return city.id
}

/** A stored boundary that isn't a well-formed polygon reads as "not drawn yet"
 *  — the same normalisation vendor.geography.service applies before resolving,
 *  so the map and the verdict agree about whether a city is mapped at all. */
function normalizeBoundary(value: unknown): ZoneBoundary | null {
  if (!value || typeof value !== "object") return null
  const type = (value as { type?: unknown }).type
  if (type !== "Polygon" && type !== "MultiPolygon") return null
  const coordinates = (value as { coordinates?: unknown }).coordinates
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null
  return value as ZoneBoundary
}

/**
 * Everything the outlet location picker needs to draw one city, in one read:
 * the operational boundary and the coverage polygons inside it.
 *
 * Zones are translated to the vendor's vocabulary before they leave the server
 * — a shape, a name, and what it means for them. ZoneLevel, operational-status
 * reasons, pause windows and admin audit fields are never sent: the vendor
 * needs to know we deliver in Westlands, not which rung of the internal
 * capability ladder Westlands currently sits on.
 */
export async function getCityCoverageForVendor(vendorId: string, cityId: string): Promise<CityCoverage> {
  const id = await assertCityAvailableToVendor(vendorId, cityId)

  const city = await prisma.city.findUniqueOrThrow({
    where : { id },
    select: {
      id: true, name: true, latitude: true, longitude: true, boundary: true,
      zones: {
        where  : { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select : { id: true, name: true, boundaries: true, level: true, operationalStatus: true },
      },
    },
  })

  const zones: CityCoverageZone[] = city.zones.map((z) => ({
    id        : z.id,
    name      : z.name,
    status    : zoneCoverageStatus(z.level, z.operationalStatus),
    boundaries: z.boundaries as unknown as ZoneBoundary,
  }))

  return {
    cityId  : city.id,
    cityName: city.name,
    centroid: city.latitude != null && city.longitude != null
      ? { latitude: city.latitude, longitude: city.longitude }
      : null,
    boundary: normalizeBoundary(city.boundary),
    zones,
  }
}

/**
 * What a candidate pin means. Called as the vendor drags the marker, so it
 * stays a single indexed city read plus in-memory ray-casting — no writes, no
 * side effects, nothing recorded. Interest is captured when an outlet is
 * actually created, not while someone is still looking around.
 */
export async function previewOutletPlacement(
  vendorId : string,
  cityId   : string,
  latitude : number,
  longitude: number,
): Promise<OutletPlacement> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new ApiError(400, "latitude must be between -90 and 90", "INVALID_COORDINATES")
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new ApiError(400, "longitude must be between -180 and 180", "INVALID_COORDINATES")
  }

  const id = await assertCityAvailableToVendor(vendorId, cityId)

  const resolved = await resolveCapabilitiesForPoint(id, { latitude, longitude })
  if (!resolved) throw new ApiError(404, "City not found", "NOT_FOUND")

  return describePlacement(resolved)
}
