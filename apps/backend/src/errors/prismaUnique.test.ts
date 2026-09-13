import { describe, expect, it } from "vitest"
import { Prisma } from "@repo/db"
import { uniqueViolationFields, isUniqueViolationOn } from "./prismaUnique"

/*
 * Regression tests for a bug found live.
 *
 * P2002's payload shape is NOT stable. The classic engine reports the violated
 * columns in `meta.target`; Prisma 7 with @prisma/adapter-pg — which this app
 * uses — reports them at `meta.driverAdapterError.cause.constraint.fields` and
 * leaves `meta.target` undefined.
 *
 * Reading only the first shape meant the customer signup webhook's "did this
 * collide on email?" check silently answered NO, and every unique-violation
 * message in the entire application said "unknown field".
 */

function p2002(meta: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002", clientVersion: "7.2.0", meta,
  })
}

describe("uniqueViolationFields", () => {
  it("reads the classic engine shape (meta.target as an array)", () => {
    expect(uniqueViolationFields(p2002({ target: ["email"] }))).toEqual(["email"])
  })

  it("reads the classic engine shape with a string target", () => {
    expect(uniqueViolationFields(p2002({ target: "email" }))).toEqual(["email"])
  })

  it("reads the DRIVER ADAPTER shape — the one that was missed", () => {
    const err = p2002({
      modelName: "ConsumerAccount",
      driverAdapterError: {
        cause: {
          originalCode   : "23505",
          originalMessage: 'duplicate key value violates unique constraint "ConsumerAccount_email_key"',
          kind           : "UniqueConstraintViolation",
          constraint     : { fields: ["email"] },
        },
      },
    })
    expect(uniqueViolationFields(err)).toEqual(["email"])
  })

  it("reads a constraint reported by index NAME rather than by column", () => {
    const err = p2002({
      driverAdapterError: { cause: { constraint: "ConsumerAccount_email_key" } },
    })
    expect(uniqueViolationFields(err)).toEqual(["ConsumerAccount_email_key"])
  })

  it("handles a multi-column constraint", () => {
    expect(uniqueViolationFields(p2002({ target: ["vendorId", "name"] })))
      .toEqual(["vendorId", "name"])
  })

  it("returns nothing for a different Prisma error code", () => {
    const notFound = new Prisma.PrismaClientKnownRequestError("nope", {
      code: "P2025", clientVersion: "7.2.0", meta: { target: ["email"] },
    })
    expect(uniqueViolationFields(notFound)).toEqual([])
  })

  it("returns nothing for something that is not a Prisma error at all", () => {
    expect(uniqueViolationFields(new Error("boom"))).toEqual([])
    expect(uniqueViolationFields(null)).toEqual([])
    expect(uniqueViolationFields(undefined)).toEqual([])
  })

  it("survives a P2002 with no meta", () => {
    const err = new Prisma.PrismaClientKnownRequestError("x", { code: "P2002", clientVersion: "7.2.0" })
    expect(uniqueViolationFields(err)).toEqual([])
  })
})

describe("isUniqueViolationOn", () => {
  it("matches the column under BOTH payload shapes", () => {
    // This is the assertion that would have caught the original bug.
    const classic = p2002({ target: ["email"] })
    const adapter = p2002({ driverAdapterError: { cause: { constraint: { fields: ["email"] } } } })

    expect(isUniqueViolationOn(classic, "email")).toBe(true)
    expect(isUniqueViolationOn(adapter, "email")).toBe(true)
  })

  it("matches a column through a Postgres index name", () => {
    const err = p2002({ driverAdapterError: { cause: { constraint: "ConsumerAccount_email_key" } } })
    expect(isUniqueViolationOn(err, "email")).toBe(true)
  })

  it("does not match a different column", () => {
    const err = p2002({ target: ["clerkId"] })
    expect(isUniqueViolationOn(err, "email")).toBe(false)
  })

  it("does not match a column that is merely a substring of another", () => {
    // "mail" must not match "email" — a loose `includes` would say it does.
    const err = p2002({ target: ["email"] })
    expect(isUniqueViolationOn(err, "mail")).toBe(false)
  })
})
