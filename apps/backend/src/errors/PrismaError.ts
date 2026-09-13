import { uniqueViolationFields } from "./prismaUnique"
import { Prisma } from "@repo/db"

import { ApiError } from "./ApiError"

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
// Connection-level failures — the database itself is unreachable, not a
// bad query. Prisma reports these inconsistently: sometimes as a
// PrismaClientInitializationError, sometimes (as observed against
// Postgres 7.x locally) as a PrismaClientKnownRequestError carrying the
// raw OS/driver error code instead of a "P____" code. Either shape means
// the same thing to the caller — try again shortly, this isn't their
// fault — so both are mapped to one 503 below.
const CONNECTION_ERROR_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server timed out
  "P1008", // Operation timed out
  "P1009", // Database already exists (rare, but init-phase)
  "P1010", // User denied access
  "P1017", // Server closed the connection
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
])

export function mapPrismaError(err: unknown): ApiError | null {
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return new ApiError(503, "We're having trouble connecting right now. Please try again shortly.", "SERVICE_UNAVAILABLE")
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (CONNECTION_ERROR_CODES.has(err.code)) {
      return new ApiError(503, "We're having trouble connecting right now. Please try again shortly.", "SERVICE_UNAVAILABLE")
    }

    switch (err.code) {
      case "P2002": {
        // Reads BOTH P2002 payload shapes — under the pg driver adapter this
        // app uses, meta.target is undefined and every message here said
        // "unknown field". See errors/prismaUnique.ts.
        const named = uniqueViolationFields(err)
        const fields = named.length > 0 ? named.join(", ") : "unknown field"
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