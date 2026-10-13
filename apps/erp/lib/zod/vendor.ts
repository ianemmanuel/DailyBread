import { z } from "zod"

// reasonCode is mandatory — the backend rejects both /reject and
// /needs-revision without it (resolved against AdminActionReason).
// rejectionReason/revisionNotes stay optional, case-specific free text
// supplementing the structured reason.
export const rejectApplicationSchema = z.object({
  reasonCode     : z.string().min(1, "Please select a reason"),
  rejectionReason: z.string(),
  revisionNotes  : z.string(),
})

export type RejectApplicationFormValues = z.output<typeof rejectApplicationSchema>

export const needsRevisionSchema = z.object({
  reasonCode     : z.string().min(1, "Please select a reason"),
  rejectionReason: z.string(),
  revisionNotes  : z.string(),
})

export type NeedsRevisionFormValues = z.output<typeof needsRevisionSchema>

export const suspendVendorSchema = z.object({
  reason: z.string().min(5, "Please provide a reason"),
})

export type SuspendVendorInput = z.infer<typeof suspendVendorSchema>

export const banVendorSchema = z.object({
  reason: z.string().min(10, "Please provide a detailed reason for the ban"),
})

export type BanVendorInput = z.infer<typeof banVendorSchema>