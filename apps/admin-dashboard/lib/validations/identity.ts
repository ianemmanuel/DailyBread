import { z } from "zod"

export const createAdminUserSchema = z.object({
  firstName     : z.string().min(2,  "First name must be at least 2 characters"),
  middleName    : z.string().default(""),          // "" when not entered — never undefined
  lastName      : z.string().min(2,  "Last name must be at least 2 characters"),
  email         : z.string().email("Please enter a valid work email address"),
  employeeId    : z.string().default(""),          // "" when not entered — never undefined
  roleId        : z.string().min(1,  "Please select a role"),
  permissionKeys: z.array(z.string()).default([]),
  scopes        : z.array(z.object({
    scopeType : z.enum(["GLOBAL", "COUNTRY", "CITY"]),
    countryId : z.string().optional(),
    cityId    : z.string().optional(),
  })).default([]),
})


export type CreateAdminUserFormValues = z.output<typeof createAdminUserSchema>

export const suspendUserSchema = z.object({
  reason: z.string().min(5, "Please provide a reason of at least 5 characters"),
})

export const deactivateUserSchema = z.object({
  reason: z.string().min(5, "Please provide a reason of at least 5 characters"),
})

export const rejectApplicationSchema = z.object({
  rejectionReason: z.string().min(10, "Please provide a detailed rejection reason of at least 10 characters"),
  revisionNotes  : z.string().default(""),
})

export type RejectApplicationFormValues = z.output<typeof rejectApplicationSchema>