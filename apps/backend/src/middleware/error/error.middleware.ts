import { Request, Response, NextFunction } from "express"
import { Prisma } from "@repo/db"

/**
 * Application error with HTTP status code and optional machine-readable code.
 * Throw this anywhere in route handlers or services:
 *
 *   throw new ApiError(404, "Vendor not found", "VENDOR_NOT_FOUND")
 */
export class ApiError extends Error {
  statusCode: number
  code: string

  constructor(statusCode: number, message: string, code = "API_ERROR") {
    super(message)
    this.statusCode = statusCode
    this.code = code
    // Restore prototype chain — required when extending built-ins in TypeScript
    Object.setPrototypeOf(this, ApiError.prototype)
  }
}

/**
 * Global error handler. Must be the last middleware registered.
 * Handles ApiError, Prisma errors, and unexpected errors uniformly.
 *
 * All responses follow the same shape:
 *   { status: "error", message: string, code: string }
 */
export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) => {
  // ── Known application error ────────────────────────────────────────────────
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      status: "error",
      message: err.message,
      code: err.code,
    })
  }

  // ── Prisma: unique constraint violation ────────────────────────────────────
  // e.g. duplicate email, duplicate business registration number
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const fields = (err.meta?.target as string[])?.join(", ") ?? "unknown field"
    return res.status(409).json({
      status: "error",
      message: `A record with this ${fields} already exists.`,
      code: "DUPLICATE_RECORD",
    })
  }

  // ── Prisma: record not found (findUniqueOrThrow, updateOrThrow, etc.) ──────
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    return res.status(404).json({
      status: "error",
      message: "Record not found.",
      code: "NOT_FOUND",
    })
  }

  // ── Prisma: foreign key constraint failed ──────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
    return res.status(400).json({
      status: "error",
      message: "Referenced record does not exist.",
      code: "INVALID_REFERENCE",
    })
  }

  // ── Prisma: validation error (bad data shape) ──────────────────────────────
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({
      status: "error",
      message: "Invalid data provided.",
      code: "VALIDATION_ERROR",
    })
  }

  // ── Unexpected error ───────────────────────────────────────────────────────
  // Log the full error in development; never expose internals to the client.
  if (process.env.NODE_ENV !== "production") {
    console.error("[error]", err)
  } else {
    // In production, log to your observability platform here (e.g. Sentry)
    console.error("[error] Unhandled exception:", err instanceof Error ? err.message : err)
  }

  return res.status(500).json({
    status: "error",
    message: "Internal server error.",
    code: "INTERNAL_SERVER_ERROR",
  })
}