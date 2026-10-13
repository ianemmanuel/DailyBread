import { z } from "zod"

export const vendorTypeSchema = z.object({
  name       : z.string().min(2, "Name must be at least 2 characters").max(80, "Name is too long"),
  description: z.string().max(500, "Description is too long"),
})

export type VendorTypeFormValues = z.output<typeof vendorTypeSchema>
