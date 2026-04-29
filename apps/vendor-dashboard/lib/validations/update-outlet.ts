import { z } from "zod"

export const updateOutletSchema = z.object({
  name         : z.string().min(2, "At least 2 characters").optional(),
  phone        : z.string().optional(),
  email        : z.string().email("Invalid email address").optional().or(z.literal("")),
  bio          : z.string().max(300, "Max 300 characters").optional(),
  addressLine1 : z.string().min(3, "Street address is required").optional(),
  addressLine2 : z.string().optional(),
  neighborhood : z.string().optional(),
  postalCode   : z.string().optional(),
  latitude     : z
    .number()
    .min(-90,  "Must be between -90 and 90")
    .max(90,   "Must be between -90 and 90")
    .optional(),
  longitude    : z
    .number()
    .min(-180, "Must be between -180 and 180")
    .max(180,  "Must be between -180 and 180")
    .optional(),
  deliveryRadius: z.number().min(0, "Must be 0 or more").optional(),
  deliveryFee  : z.number().min(0, "Must be 0 or more").optional(),
  minimumOrder : z.number().min(0, "Must be 0 or more").optional(),
})

export type UpdateOutletFormValues = z.infer<typeof updateOutletSchema>