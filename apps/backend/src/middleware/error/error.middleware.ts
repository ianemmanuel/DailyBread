import { Request, Response, NextFunction } from "express"
import { Prisma }  from "@repo/db"
import { logger }  from "@/lib/pino/logger"
import { sendError } from "@/helpers/api-response/response"

const errorLog = logger.child({ module: "error-handler" })

/**
 * Application error with HTTP status code and optional machine-readable code.
 * Throw this anywhere in route handlers or services:
 *
 *   throw new ApiError(404, "Vendor not found", "VENDOR_NOT_FOUND")
 */
export class ApiError extends Error {
  statusCode : number
  code       : string

  constructor(statusCode: number, message: string, code = "API_ERROR") {
    super(message)
    this.statusCode = statusCode
    this.code       = code
    Object.setPrototypeOf(this, ApiError.prototype)
  }
}

/**
 * Global error handler. Must be the last middleware registered.
 */
export const errorHandler = (
  err  : unknown,
  req  : Request,
  res  : Response,
  _next: NextFunction,
) => {
  // ── Known application error ────────────────────────────────────────────────
  if (err instanceof ApiError) {
    // 4xx errors are expected — log at warn, not error
    if (err.statusCode >= 500) {
      errorLog.error({ err, correlationId: req.id }, err.message)
    } else {
      errorLog.warn({ statusCode: err.statusCode, code: err.code, correlationId: req.id }, err.message)
    }
    return sendError(res, err.statusCode, err.message, err.code)
  }

  // ── Prisma: unique constraint violation ────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const fields = (err.meta?.target as string[])?.join(", ") ?? "unknown field"
    errorLog.warn({ prismaCode: "P2002", fields, correlationId: req.id }, "Duplicate record")
    return sendError(res, 409, `A record with this ${fields} already exists.`, "DUPLICATE_RECORD")
  }

  // ── Prisma: record not found ───────────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    errorLog.warn({ prismaCode: "P2025", correlationId: req.id }, "Record not found")
    return sendError(res, 404, "Record not found.", "NOT_FOUND")
  }

  // ── Prisma: foreign key constraint ────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
    errorLog.warn({ prismaCode: "P2003", correlationId: req.id }, "FK constraint failed")
    return sendError(res, 400, "Referenced record does not exist.", "INVALID_REFERENCE")
  }

  // ── Prisma: validation error ───────────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientValidationError) {
    errorLog.warn({ correlationId: req.id }, "Prisma validation error")
    return sendError(res, 400, "Invalid data provided.", "VALIDATION_ERROR")
  }

  // ── Unexpected error ───────────────────────────────────────────────────────
  // Always log at error level with the full stack in production
  errorLog.error({ err, correlationId: req.id }, "Unhandled exception")

  return sendError(res, 500, "Internal server error.", "INTERNAL_SERVER_ERROR")
}