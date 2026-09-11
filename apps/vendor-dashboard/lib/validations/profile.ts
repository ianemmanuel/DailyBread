import { z } from "zod"

/*
 * Vendor public-profile validation.
 *
 * Mirrors the backend's own rules rather than inventing softer ones — the
 * server re-validates everything and stays authoritative. What this buys is
 * the vendor finding out before they submit, and the character counters having
 * a single number to count against.
 *
 * Length caps follow what merchant platforms actually enforce: a tagline is a
 * one-liner, a description is the short "about" Uber Eats and DoorDash show on
 * a store page, and the story is the longer Yelp/Google-style background —
 * capped so it stays a paragraph rather than an essay.
 */

export const PROFILE_LIMITS = {
  displayName: 60,
  tagline    : 80,
  description: 300,
  story      : 1000,
} as const

/** Optional free-text: empty string and undefined both mean "not set". */
const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer`).optional().or(z.literal(""))

const optionalUrl = z
  .string()
  .trim()
  .url("Enter a full URL, including https://")
  .optional()
  .or(z.literal(""))

export const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Your public name must be at least 2 characters")
    .max(PROFILE_LIMITS.displayName, `Your public name must be ${PROFILE_LIMITS.displayName} characters or fewer`),

  tagline    : optionalText(PROFILE_LIMITS.tagline, "Tagline"),
  description: optionalText(PROFILE_LIMITS.description, "Description"),
  story      : optionalText(PROFILE_LIMITS.story, "Your story"),

  publicEmail: z.string().trim().email("Enter a valid email address").optional().or(z.literal("")),
  publicPhone: z.string().trim().max(32, "Phone number is too long").optional().or(z.literal("")),
  website: optionalUrl,

  /*
   * Bounded to a sane window rather than "any number": a four-digit year in
   * the future is always a typo, and one before the 1800s is never a food
   * business a delivery platform is onboarding.
   */
  foundedYear: z
    .number()
    .int("Enter a four-digit year")
    .min(1800, "Enter a year after 1800")
    .max(new Date().getFullYear(), "That year is in the future")
    .nullable()
    .optional(),
})

export type ProfileFormValues = z.infer<typeof profileSchema>

/** Field-keyed errors, so each input can render its own message inline. */
export type ProfileFieldErrors = Partial<Record<keyof ProfileFormValues, string>>

export function validateProfile(values: ProfileFormValues): ProfileFieldErrors | null {
  const result = profileSchema.safeParse(values)
  if (result.success) return null

  const errors: ProfileFieldErrors = {}
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof ProfileFormValues | undefined
    // First error per field — showing three messages under one input is noise.
    if (key && !errors[key]) errors[key] = issue.message
  }
  return errors
}
