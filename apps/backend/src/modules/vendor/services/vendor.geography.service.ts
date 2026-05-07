import { prisma, GeoStatus, ServiceAreaMode } from "@repo/db"
import { BoundingBox, CityBoundary, ServiceAreaBoundary } from "@repo/geo/types"



//* Vendor-facing read
// Called by vendor.outlet.service and vendor.geography.service.
// Returns everything needed to validate a point and resolve its service mode.

export async function getCityGeoConfig(cityId: string) {
  const city = await prisma.city.findUnique({
    where : { id: cityId },
    select: {
      id          : true,
      countryId   : true,
      status      : true,
      boundary    : true,
      boundingBox : true,
      serviceAreas: {
        where : { status: "ACTIVE" },
        select: { id: true, name: true, mode: true, boundaries: true },
      },
    },
  })

  if (!city) return null

  return {
    id          : city.id,
    countryId   : city.countryId,
    status      : city.status,
    boundary    : city.boundary    as unknown as CityBoundary | null,
    boundingBox : city.boundingBox as unknown as BoundingBox  | null,
    serviceAreas: city.serviceAreas.map(sa => ({
      id        : sa.id,
      name      : sa.name,
      mode      : sa.mode as ServiceAreaMode,
      boundaries: sa.boundaries as unknown as ServiceAreaBoundary,
    })),
  }
}