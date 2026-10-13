/**
 * Normalizes a single TanStack Form field error into a displayable string.
 * Depending on the validator (Zod schema vs. plain function), an entry in
 * `field.state.meta.errors` may be a bare string or an object carrying a
 * `message` — this collapses both to one shape for form UI.
 */
export function getFieldError(error: unknown): string {
  if (!error) return ""
  if (typeof error === "string") return error
  if (typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message
  }
  return String(error)
}
