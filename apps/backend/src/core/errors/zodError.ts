import { ZodError } from "zod"
import { ApiError, type ApiErrorDetail } from "./apiError"

/**
 * Converts a ZodError into the same ApiError shape everything else in
 * the error pipeline already speaks — so validation failures flow
 * through the exact same sendError() call as any other operational
 * error, just with `errors` populated.
 */
export function zodErrorToApiError(err: ZodError): ApiError {
  const errors: ApiErrorDetail[] = err.issues.map((issue) => ({
    field  : issue.path.length ? issue.path.join(".") : undefined,
    message: issue.message,
  }))

  return new ApiError(400, "Validation failed.", "VALIDATION_ERROR", errors)
}