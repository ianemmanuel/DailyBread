
import { z } from "zod"

//* Create city 
export const createCitySchema = z.object({
  name    : z.string().min(2, "City name must be at least 2 characters").max(100),
  code    : z.string().max(10).optional().or(z.literal("")),
  timezone: z.string().min(1, "Timezone is required"),
})

export type CreateCityFormValues = z.infer<typeof createCitySchema>

//* Save city boundary
export const saveBoundarySchema = z.object({
  boundary: z.object({
    type       : z.enum(["Polygon", "MultiPolygon"]),
    coordinates: z.array(z.unknown()),
  }),
  source: z.enum(["OSM", "MANUAL"]),
  osmId : z.string().optional(),
})

export type SaveBoundaryFormValues = z.infer<typeof saveBoundarySchema>

//* Create / update service area

export const createServiceAreaSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must be under 80 characters"),
  mode: z.enum(["FULL_SERVICE", "SELF_DELIVERY", "WAITLIST", "EXCLUDED"], {
    required_error: "Select a service mode",
  }),
})

export type CreateServiceAreaFormValues = z.infer<typeof createServiceAreaSchema>

//* Create / update delivery zone

export const createDeliveryZoneSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must be under 80 characters"),
  maxCourierCount: z
    .number({ invalid_type_error: "Must be a number" })
    .int("Must be a whole number")
    .min(1, "Must be at least 1")
    .optional(),
})

export type CreateDeliveryZoneFormValues = z.infer<typeof createDeliveryZoneSchema>