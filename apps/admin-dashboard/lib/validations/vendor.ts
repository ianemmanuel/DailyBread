import { z } from "zod"

export const rejectApplicationSchema = z.object({
  rejectionReason: z.string().min(10, "Please provide a detailed rejection reason"),
  revisionNotes  : z.string(),
})

export type RejectApplicationInput = z.infer<typeof rejectApplicationSchema>

export const suspendVendorSchema = z.object({
  reason: z.string().min(5, "Please provide a reason"),
})

export type SuspendVendorInput = z.infer<typeof suspendVendorSchema>

export const banVendorSchema = z.object({
  reason: z.string().min(10, "Please provide a detailed reason for the ban"),
})

export type BanVendorInput = z.infer<typeof banVendorSchema>