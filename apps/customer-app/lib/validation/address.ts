import { z } from "zod"

/*
 * What a customer types when saving a delivery address.
 *
 * ── This validates the TYPED lines, and nothing geographic ─────────────────
 *
 * The destination is the PIN. Country and the real city are derived from it by
 * the server, and a supplied country that contradicts the coordinates is
 * refused there — so there is nothing here to validate about geography, and
 * anything this file "checked" about it would be a second, weaker copy of a
 * rule that already exists (principle 1).
 *
 * These fields exist so a rider can find the door. That is why line 1 and city
 * are required: a pin puts someone on the right building, and "Apartment 3B,
 * green gate" is what gets the food to the right door.
 *
 * ── Client validation tells someone EARLY; it never decides ────────────────
 *
 * Every limit here mirrors the backend's own (`text(...)` in
 * customer.address.service.ts: 40 / 200 / 200 / 100 / 20). The value of
 * duplicating them is a message under the field instead of a round trip; the
 * backend re-checks all of it, and a crafted request meets exactly the same
 * limits.
 */

export const addressFormSchema = z.object({
  label: z
    .string()
    .trim()
    .max(40, "Keep the name under 40 characters.")
    .optional(),

  addressLine1: z
    .string()
    .trim()
    .min(1, "Add a street, building or landmark so the rider can find you.")
    .max(200, "That is too long — keep it under 200 characters."),

  addressLine2: z
    .string()
    .trim()
    .max(200, "That is too long — keep it under 200 characters.")
    .optional(),

  city: z
    .string()
    .trim()
    .min(1, "Which city is this address in?")
    .max(100, "That is too long — keep it under 100 characters."),

  postalCode: z
    .string()
    .trim()
    .max(20, "That does not look like a postal code.")
    .optional(),
})

export type AddressFormValues = z.infer<typeof addressFormSchema>
