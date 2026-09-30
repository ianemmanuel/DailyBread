import { ApiError } from "@/middleware/error"

/**
 * An optional free-text field: absent or blank is null, anything else is
 * trimmed and length-checked, and a non-string is refused rather than coerced.
 *
 * In lib/ because meals, modifier groups and discounts all accept it and none
 * of them owns what "optional text" means.
 */
export function normalizeOptionalText(value: unknown, max: number, label: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== "string") throw new ApiError(400, `${label} must be text.`, "INVALID_FIELD")
  const text = value.trim()
  if (!text) return null
  if (text.length > max) {
    throw new ApiError(400, `${label} is too long — keep it under ${max} characters.`, "INVALID_FIELD")
  }
  return text
}
