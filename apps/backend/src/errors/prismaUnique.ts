import { Prisma } from "@repo/db"

/*
 * Which column a unique constraint failed on.
 *
 * Exists because P2002's payload shape is NOT stable across Prisma setups, and
 * assuming one of them is a bug that only shows up at runtime:
 *
 *   - the classic engine puts the columns in `meta.target`;
 *   - Prisma 7 with a driver adapter (the pg adapter this app uses) instead
 *     nests them at `meta.driverAdapterError.cause.constraint.fields`, leaving
 *     `meta.target` undefined.
 *
 * Both shapes are read here, in one place, so no caller has to know which is in
 * play. Found live: the customer signup webhook's "did this collide on email?"
 * check silently answered no under the pg adapter, and PrismaError.ts's
 * user-facing message said "unknown field" for every unique violation in the
 * whole application.
 */

interface AdapterConstraint { fields?: unknown }
interface AdapterCause { constraint?: AdapterConstraint | string }
interface AdapterError { cause?: AdapterCause }

/** Every column named by a P2002, or an empty array when it is not one. */
export function uniqueViolationFields(err: unknown): string[] {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return []

  const meta = err.meta as Record<string, unknown> | undefined
  if (!meta) return []

  // Classic engine.
  const target = meta.target
  if (Array.isArray(target)) return target.map(String)
  if (typeof target === "string") return [target]

  // Driver adapter (Prisma 7 + @prisma/adapter-pg).
  const constraint = (meta.driverAdapterError as AdapterError | undefined)?.cause?.constraint
  if (constraint && typeof constraint === "object" && Array.isArray(constraint.fields)) {
    return constraint.fields.map(String)
  }
  // Some adapters report the constraint by NAME rather than by column. A
  // Postgres unique index is named "<Table>_<column>_key" by convention, so the
  // name still answers "which column" for a single-column constraint.
  if (typeof constraint === "string") return [constraint]

  return []
}

/** Whether a P2002 names this specific column. Substring rather than equality
 *  so a constraint reported by index NAME ("ConsumerAccount_email_key") still
 *  matches the column it is on. */
export function isUniqueViolationOn(err: unknown, field: string): boolean {
  return uniqueViolationFields(err).some(
    (name) => name === field || name.includes(`_${field}_`) || name.endsWith(`_${field}`),
  )
}
