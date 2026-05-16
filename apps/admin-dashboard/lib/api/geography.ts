
/* 
    All geography API calls from the Next.js frontend to the Express backend.
    Uses the Next.js route handler pattern — calls go to /api/... which proxies
    to the backend with the auth token. Never calls the backend directly from
    the browser (avoids CORS, keeps token handling server-side).
*/
import type {
  Country,
  City,
  CityDetail,
  CityBoundaryData,
  OsmPreviewResult,
  ServiceArea,
  DeliveryZone,
  ServiceAreaMode,
  CityBoundary,
  ServiceAreaBoundary,
  DeliveryZoneBoundary,
} from "@repo/types/admin-app"

//* Shared fetch wrapper

interface ApiResponse<T> {
  data   : T
  message: string
  status : "success" | "error"
}

class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function apiFetch<T>(
  path    : string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`/api/geography${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  })

  const json: ApiResponse<T> | { message: string; code?: string } = await res.json()

  if (!res.ok) {
    const err = json as { message: string; code?: string }
    throw new ApiError(err.message ?? "Request failed", err.code, res.status)
  }

  return (json as ApiResponse<T>).data
}

//* Countries 

export const getCountries = (): Promise<Country[]> =>
  apiFetch<Country[]>("/countries")

export const getCountry = (countryId: string): Promise<Country> =>
  apiFetch<Country>(`/countries/${countryId}`)

export const activateCountry = (countryId: string): Promise<{ success: boolean }> =>
  apiFetch(`/countries/${countryId}/activate`, { method: "POST" })

export const deactivateCountry = (countryId: string): Promise<{ success: boolean; activeVendorCount: number }> =>
  apiFetch(`/countries/${countryId}/deactivate`, { method: "POST" })

//* Cities

export const getCities = (countryId: string): Promise<City[]> =>
  apiFetch<City[]>(`/countries/${countryId}/cities`)

export const getCity = (cityId: string): Promise<CityDetail> =>
  apiFetch<CityDetail>(`/cities/${cityId}`)

export const createCity = (
  countryId: string,
  body: { name: string; code?: string; timezone: string },
): Promise<City> =>
  apiFetch<City>(`/countries/${countryId}/cities`, {
    method: "POST",
    body  : JSON.stringify(body),
  })

export const updateCity = (
  cityId: string,
  body: { name?: string; code?: string; timezone?: string },
): Promise<City> =>
  apiFetch<City>(`/cities/${cityId}`, {
    method: "PATCH",
    body  : JSON.stringify(body),
  })

export const activateCity = (cityId: string): Promise<{ success: boolean }> =>
  apiFetch(`/cities/${cityId}/activate`, { method: "POST" })

export const deactivateCity = (cityId: string): Promise<{ success: boolean; activeOutletCount: number }> =>
  apiFetch(`/cities/${cityId}/deactivate`, { method: "POST" })

//* City boundary

export const getCityBoundary = (cityId: string): Promise<CityBoundaryData> =>
  apiFetch<CityBoundaryData>(`/cities/${cityId}/boundary`)

export const previewOsmBoundary = (
  cityId     : string,
  q          : string,
  countryCode: string,
): Promise<OsmPreviewResult | null> =>
  apiFetch<OsmPreviewResult | null>(
    `/cities/${cityId}/boundary/osm-preview?q=${encodeURIComponent(q)}&countryCode=${encodeURIComponent(countryCode)}`,
  )

export const saveCityBoundary = (
  cityId: string,
  body  : { boundary: CityBoundary; source: "OSM" | "MANUAL"; osmId?: string },
): Promise<{ success: boolean; boundingBox: object; centroid: object; source: string; osmId: string | null }> =>
  apiFetch(`/cities/${cityId}/boundary`, {
    method: "POST",
    body  : JSON.stringify(body),
  })

export const clearCityBoundary = (cityId: string): Promise<{ success: boolean }> =>
  apiFetch(`/cities/${cityId}/boundary`, { method: "DELETE" })

//* Service areas

export const getServiceAreas = (cityId: string): Promise<ServiceArea[]> =>
  apiFetch<ServiceArea[]>(`/cities/${cityId}/service-areas`)

export const createServiceArea = (
  cityId: string,
  body  : { name: string; mode: ServiceAreaMode; boundary: ServiceAreaBoundary },
): Promise<ServiceArea> =>
  apiFetch<ServiceArea>(`/cities/${cityId}/service-areas`, {
    method: "POST",
    body  : JSON.stringify(body),
  })

export const updateServiceArea = (
  serviceAreaId: string,
  body         : { name?: string; mode?: ServiceAreaMode; boundary?: ServiceAreaBoundary },
): Promise<ServiceArea> =>
  apiFetch<ServiceArea>(`/service-areas/${serviceAreaId}`, {
    method: "PATCH",
    body  : JSON.stringify(body),
  })

export const activateServiceArea = (serviceAreaId: string): Promise<{ success: boolean }> =>
  apiFetch(`/service-areas/${serviceAreaId}/activate`, { method: "POST" })

export const deactivateServiceArea = (serviceAreaId: string): Promise<{ success: boolean; linkedOutlets: number }> =>
  apiFetch(`/service-areas/${serviceAreaId}/deactivate`, { method: "POST" })

export const deleteServiceArea = (serviceAreaId: string): Promise<{ success: boolean }> =>
  apiFetch(`/service-areas/${serviceAreaId}`, { method: "DELETE" })

//* Delivery zones

export const getDeliveryZones = (cityId: string): Promise<DeliveryZone[]> =>
  apiFetch<DeliveryZone[]>(`/cities/${cityId}/delivery-zones`)

export const createDeliveryZone = (
  cityId: string,
  body  : { name: string; boundary: DeliveryZoneBoundary; maxCourierCount?: number },
): Promise<{ zone: DeliveryZone; overlapWarning: string | null }> =>
  apiFetch(`/cities/${cityId}/delivery-zones`, {
    method: "POST",
    body  : JSON.stringify(body),
  })

export const updateDeliveryZone = (
  zoneId: string,
  body  : { name?: string; boundary?: DeliveryZoneBoundary; maxCourierCount?: number },
): Promise<{ zone: DeliveryZone; overlapWarning: string | null }> =>
  apiFetch(`/delivery-zones/${zoneId}`, {
    method: "PATCH",
    body  : JSON.stringify(body),
  })

export const activateDeliveryZone = (zoneId: string): Promise<{ success: boolean }> =>
  apiFetch(`/delivery-zones/${zoneId}/activate`, { method: "POST" })

export const deactivateDeliveryZone = (zoneId: string): Promise<{ success: boolean }> =>
  apiFetch(`/delivery-zones/${zoneId}/deactivate`, { method: "POST" })

export const deleteDeliveryZone = (zoneId: string): Promise<{ success: boolean }> =>
  apiFetch(`/delivery-zones/${zoneId}`, { method: "DELETE" })