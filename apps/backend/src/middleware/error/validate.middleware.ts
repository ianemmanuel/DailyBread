import type { RequestHandler } from "express"
import type { ZodSchema } from "zod"
import { zodErrorToApiError } from "@/core/errors/zodError"


type ValidationSource = "body" | "query" | "params"

/**
 * Validates req[source] against a Zod schema. On failure, converts
 * the ZodError into an ApiError and hands it to next() — it flows
 * through the same error pipeline (and response shape) as every
 * other operational error.
 *
 * On success, req[source] is replaced with the parsed (and
 * Zod-transformed/defaulted) data.
 *
 *   router.post("/users", validate(createAdminUserSchema), handleCreateAdminUser)
 *   router.get("/users", validate(listUsersQuerySchema, "query"), handleListAdminUsers)
 */
export function validate(schema: ZodSchema, source: ValidationSource = "body"): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[source])

    if (!result.success) {
      return next(zodErrorToApiError(result.error))
    }

    // req.query/req.params are typed narrower than arbitrary parsed
    // output in Express — safe to assign, Zod already validated the shape.
    ;(req as any)[source] = result.data

    next()
  }
}