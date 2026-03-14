import { z } from 'zod'

/*
  ONBOARDING VALIDATION SCHEMAS
  Used by BusinessDetailsForm with react-hook-form + zodResolver.

  DocumentsForm uses direct fetch calls with a file input — no form
  library is involved there, so no Zod schema is needed for documents.
*/

export const businessDetailsSchema = z.object({
  countryId:    z.string().min(1, 'Country is required'),
  vendorTypeId: z.string().min(1, 'Vendor type is required'),
  // Only required when vendorType.name === "Other" — enforced in the UI
  otherVendorType: z.string().optional(),

  legalBusinessName: z
    .string()
    .min(2,   'Legal business name must be at least 2 characters')
    .max(200, 'Legal business name must not exceed 200 characters'),

  registrationNumber: z.string().optional(),
  taxId:              z.string().optional(),

  businessEmail: z.string().email('Invalid email address'),
  businessPhone: z.string().optional(),

  ownerFirstName: z
    .string()
    .min(2,   'First name must be at least 2 characters')
    .max(100, 'First name must not exceed 100 characters'),
  ownerLastName: z
    .string()
    .min(2,   'Last name must be at least 2 characters')
    .max(100, 'Last name must not exceed 100 characters'),

  // .or(z.literal('')) allows the controlled input to be cleared without
  // triggering an email format error on an empty string
  ownerEmail: z.string().email('Invalid email address').optional().or(z.literal('')),
  ownerPhone: z.string().optional(),

  businessAddress: z
    .string()
    .min(5,   'Address must be at least 5 characters')
    .max(300, 'Address must not exceed 300 characters'),
  addressLine2: z
    .string()
    .max(300, 'Address line 2 must not exceed 300 characters')
    .optional(),
  postalCode: z.string().optional(),
})

export type BusinessDetailsFormData = z.infer<typeof businessDetailsSchema>