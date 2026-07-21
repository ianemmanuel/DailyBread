import { Request, Response, NextFunction } from "express"
import { ZodError } from "zod"
import { logger } from "@/lib/pino/logger"
import { sendError } from "@/helpers/api-response/response"
import { ApiError } from "@/core/errors/apiError"
import { zodErrorToApiError } from "@/core/errors/zodError"
import { mapPrismaError } from "@/core/errors/prismaError"

const errorLog = logger.child({ module: "error-handler" })

/**
 * Converts any thrown value into an ApiError. Everything the app
 * already recognizes (ApiError itself, Zod validation errors, known
 * Prisma errors) becomes an operational ApiError. Anything else is
 * genuinely unknown — isOperational: false — and gets treated as a bug.
 */
function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  if (err instanceof ZodError) return zodErrorToApiError(err)

  const prismaError = mapPrismaError(err)
  if (prismaError) return prismaError

  return new ApiError(500, "Internal server error.", "INTERNAL_SERVER_ERROR", undefined, false)
}

//* Global error handler. Must be the last middleware registered.

export const errorHandler = (
  err  : unknown,
  req  : Request,
  res  : Response,
  _next: NextFunction,
) => {
  const apiError = toApiError(err)

  if (apiError.isOperational) {
    // Still worth an `error`-level log if it's a 5xx — e.g. an
    // upstream dependency being down is operational, but you still
    // want it in your alerting, not silently at warn.
    if (apiError.statusCode >= 500) {
      errorLog.error({ err, correlationId: req.id }, apiError.message)
    } else {
      errorLog.warn({ statusCode: apiError.statusCode, code: apiError.code, correlationId: req.id }, apiError.message)
    }
  } else {
    //* Not something we recognize — treat as a bug, not routine traffic.
    errorLog.error({ err, correlationId: req.id }, "Unhandled exception")
  }

  return sendError(res, apiError.statusCode, apiError.message, apiError.code, apiError.errors)
}