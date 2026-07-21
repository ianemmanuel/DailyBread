import { Prisma } from "@repo/db"
import { ApiError } from "./apiError"

/**
 * Translates known Prisma error types into ApiError instances.
 *
 * Returns null for anything not explicitly mapped below — including
 * PrismaClientKnownRequestError codes we haven't seen before. That's
 * deliberate: an unmapped Prisma error stays classified as unknown
 * (isOperational: false, logged at error level) rather than silently
 * getting treated as routine just because it came from Prisma. Add a
 * case here once you've actually decided what the client should be
 * told for a given code.
 */
export function mapPrismaError(err: unknown): ApiError | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002": {
        const fields = (err.meta?.target as string[])?.join(", ") ?? "unknown field"
        return new ApiError(409, `A record with this ${fields} already exists.`, "DUPLICATE_RECORD")
      }
      case "P2025":
        return new ApiError(404, "Record not found.", "NOT_FOUND")
      case "P2003":
        return new ApiError(400, "Referenced record does not exist.", "INVALID_REFERENCE")
      default:
        return null
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return new ApiError(400, "Invalid data provided.", "VALIDATION_ERROR")
  }

  return null
}