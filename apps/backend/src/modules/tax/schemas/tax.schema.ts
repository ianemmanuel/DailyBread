import { z } from "zod"

/*
 * Tax rates cross the wire as BASIS POINTS, already an integer, exactly as
 * prices cross as minor units. The admin form does the percent-to-bps
 * conversion because a percentage is a human's unit, not a storage one:
 * accepting 16 here and multiplying by 100 on the server would mean the same
 * endpoint reads "16" as both 16% and 0.16% depending on the caller.
 */

export const createTaxCategorySchema = z
  .object({
    name       : z.string().min(1).max(80),
    description: z.string().max(500).optional(),
    // Derived from the name when omitted. Immutable once set.
    code       : z.string().min(1).max(60).optional(),
  })
  .strict()

export const updateTaxCategorySchema = z
  .object({
    name       : z.string().min(1).max(80),
    description: z.string().max(500).optional(),
  })
  .strict()

export const setTaxCategoryStatusSchema = z
  .object({ status: z.enum(["ACTIVE", "SUSPENDED"]) })
  .strict()

export const setCountryTaxSettingsSchema = z
  .object({
    pricesIncludeTax: z.boolean(),
    taxRemittedBy   : z.enum(["VENDOR", "PLATFORM"]),
    // What this market calls it: "VAT", "GST", "Sales Tax".
    taxName         : z.string().max(40).nullable().optional(),
  })
  .strict()

export const upsertCountryTaxRateSchema = z
  .object({
    taxCategoryId: z.string().uuid(),
    rateBps      : z.number().int().min(0).max(10_000),
    isStandard   : z.boolean().optional(),
  })
  .strict()

export const setCountryTaxRateStatusSchema = z
  .object({ status: z.enum(["ACTIVE", "INACTIVE"]) })
  .strict()

export type CreateTaxCategoryInput = z.infer<typeof createTaxCategorySchema>
export type UpdateTaxCategoryInput = z.infer<typeof updateTaxCategorySchema>
export type SetCountryTaxSettingsInput = z.infer<typeof setCountryTaxSettingsSchema>
export type UpsertCountryTaxRateInput = z.infer<typeof upsertCountryTaxRateSchema>
