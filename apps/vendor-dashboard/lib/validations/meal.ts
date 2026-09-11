import { z } from "zod"

/*
 * Meal validation.
 *
 * Mirrors the backend's rules rather than inventing softer ones — the server
 * re-validates everything and stays authoritative. What this buys is the vendor
 * finding out before they submit, and the character counters having a single
 * number to count against.
 *
 * The caps follow what merchant platforms actually enforce: a dish name is a
 * label, not a sentence, and the description is the short blurb Uber Eats and
 * DoorDash show under the photo.
 */

export const MEAL_LIMITS = {
  name       : 80,
  description: 500,
  portionSize: 60,
  images     : 6,
  cuisines   : 3,
  dietaryTags: 6,
} as const

/*
 * Price is validated as TEXT here and converted to minor units at submit.
 *
 * A number input would let the browser decide what "1,250" means, and a zod
 * number schema cannot know how many decimals the vendor's currency has — that
 * comes from Currency.minorUnitDigits, which is 0 for UGX and 3 for KWD. So the
 * shape is checked here and the scale is applied by toMinorUnits, which is the
 * one place that knows the currency.
 */
const priceText = z
  .string()
  .trim()
  .min(1, "Add a price")
  .refine((v) => /^[\d\s,]*\.?\d*$/.test(v), "Use numbers only, for example 1250.00")
  .refine((v) => Number(v.replace(/[\s,]/g, "")) > 0, "The price has to be more than zero")

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer`).optional().or(z.literal(""))

export const mealSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give the meal a name")
    .max(MEAL_LIMITS.name, `The name must be ${MEAL_LIMITS.name} characters or fewer`),

  description: optionalText(MEAL_LIMITS.description, "Description"),
  portionSize: optionalText(MEAL_LIMITS.portionSize, "Portion size"),

  price    : priceText,
  sectionId: z.string().optional().or(z.literal("")),

  cuisineIds   : z.array(z.string()).max(MEAL_LIMITS.cuisines, `Pick up to ${MEAL_LIMITS.cuisines} cuisines`),
  dietaryTagIds: z.array(z.string()).max(MEAL_LIMITS.dietaryTags, `Pick up to ${MEAL_LIMITS.dietaryTags} dietary tags`),

  /*
   * At least one, always. A dish sold nowhere is invisible to every customer,
   * and a vendor who saved one would reasonably assume the save had failed —
   * so this is an error, not a silent "all outlets" default. The form
   * pre-selects the only outlet for a single-location vendor, so this rule
   * never fires for the common case.
   */
  outletIds: z.array(z.string()).min(1, "Choose at least one location that sells this"),

  imageKeys: z.array(z.string()).max(MEAL_LIMITS.images, `You can add up to ${MEAL_LIMITS.images} photos`),
})

export type MealFormValues = z.infer<typeof mealSchema>

/** One message per field, in the shape the form holds its errors. */
export function validateMeal(values: MealFormValues): Partial<Record<keyof MealFormValues, string>> {
  const result = mealSchema.safeParse(values)
  if (result.success) return {}

  const errors: Partial<Record<keyof MealFormValues, string>> = {}
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof MealFormValues | undefined
    if (field && !errors[field]) errors[field] = issue.message
  }
  return errors
}
