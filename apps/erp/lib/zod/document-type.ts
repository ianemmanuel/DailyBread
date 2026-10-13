import { z } from "zod"

// code is system-generated from the name (see generateDocumentTypeCode in
// admin.documentType.service.ts) — never collected from the admin, so it's
// not part of either schema below.
//
// Kept as a plain object (not the refined version) so `.shape.x` stays
// available for field-level onBlur validators — .refine() drops it.
export const documentTypeBaseSchema = z.object({
  name             : z.string().min(2, "Name must be at least 2 characters").max(120, "Name is too long"),
  description      : z.string().max(500, "Description is too long"),
  scope            : z.enum(["VENDOR", "OUTLET", "CITY"]),
  // Required only when scope is CITY — enforced by the .refine() below,
  // not here, so this field alone stays optional.
  cityId           : z.string().optional(),
  isRequired       : z.boolean(),
  requiresExpiry   : z.boolean(),
  expiryWarningDays: z.number().int().min(0, "Must be 0 or more").max(365, "Must be 365 or fewer"),
  instructions     : z.string().max(1000, "Instructions are too long"),
  sampleUrl        : z.union([z.literal(""), z.string().url("Must be a valid URL")]),
  // Compliance framework (phase 2) — see /vendors/compliance.
  complianceSeverity: z.enum(["LOW", "MEDIUM", "CRITICAL"]),
  gracePeriodDays   : z.number().int().min(0, "Must be 0 or more").max(365, "Must be 365 or fewer"),
  // Empty string = enforced immediately (no rollout window).
  enforcedFrom      : z.string(),
})

const requireCityForCityScope = (schema: typeof documentTypeBaseSchema) =>
  schema.refine((v) => v.scope !== "CITY" || !!v.cityId, {
    message: "Select a city for a city-scoped document",
    path: ["cityId"],
  })

export const documentTypeCreateSchema = requireCityForCityScope(documentTypeBaseSchema)
export type DocumentTypeCreateFormValues = z.output<typeof documentTypeBaseSchema>

// Scope/city are now editable after creation too — the "immutable" write-up
// only made sense while there was nothing to configure about scope.
export const documentTypeUpdateSchema = requireCityForCityScope(documentTypeBaseSchema)
export type DocumentTypeUpdateFormValues = z.output<typeof documentTypeBaseSchema>
