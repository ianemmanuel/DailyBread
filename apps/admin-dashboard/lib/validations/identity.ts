import { z } from "zod"

/**
 * ROOT CAUSE OF THE PERSISTENT TYPE ERROR
 * ─────────────────────────────────────────
 * TanStack Form compares the schema's ~standard.types.input against the
 * form's inferred value type.
 *
 * z.array(...).default([])  →  input type: T[] | undefined   ← BREAKS
 * z.array(...)              →  input type: T[]               ← WORKS
 *
 * The form defaultValues already supply [] for every array field, so Zod's
 * .default([]) is redundant AND harmful — it makes the input type T[] | undefined
 * which is incompatible with the form's inferred T[].
 *
 * FIX: Remove .default([]) from all array fields. Use plain z.array(...).
 * The form supplies the default value via defaultValues; the schema only
 * validates shape.
 *
 * Same principle applies to scalar fields: z.string().default("") makes
 * input type string | undefined. Use plain z.string() instead.
 */

export const createAdminUserSchema = z.object({
  firstName      : z.string().min(2, "First name must be at least 2 characters"),
  middleName     : z.string(),
  lastName       : z.string().min(2, "Last name must be at least 2 characters"),
  email          : z.string().email("Please enter a valid work email address"),
  employeeId     : z.string(),
  roleId         : z.string().min(1, "Please select a role"),
  permissionKeys : z.array(z.string()),   // no .default() — form supplies []
  scopes         : z.array(z.object({
    scopeType : z.enum(["GLOBAL", "COUNTRY", "CITY"]),
    countryId : z.string().optional(),
    cityId    : z.string().optional(),
  })),                                    // no .default() — form supplies []
})

export type CreateAdminUserFormValues = z.output<typeof createAdminUserSchema>

export const suspendUserSchema = z.object({
  reason: z.string().min(5, "Please provide a reason of at least 5 characters"),
})

export const deactivateUserSchema = z.object({
  reason: z.string().min(5, "Please provide a reason of at least 5 characters"),
})