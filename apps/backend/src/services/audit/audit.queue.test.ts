import { describe, it, expect, vi } from "vitest"

/*
 * The drain must wait for writes started through auditService.log — the real
 * entry point, not the queue in isolation. The defect this guards was exactly
 * that the two kept separate lists, so a test of either half alone passed.
 */
/* A plain holder rather than vi.fn(): Vitest's mock wrapper tracks the
 * promises a mock returns, and reports a deliberately rejected one as a test
 * error of its own. */
let nextWrite: Promise<void> = Promise.resolve()
vi.mock("@repo/db", () => ({
  prisma        : { auditLog: { create: () => nextWrite } },
  Prisma        : {},
  SYSTEM_USER_ID: "system",
}))

const { auditService, drainAuditQueue } = await import("./index")

function deferred() {
  let resolve!: () => void
  let reject!: (err: Error) => void
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const entry = { adminUserId: "admin-1", action: "menu_item.approved", entityType: "MenuItem", entityId: "item-1" }

describe("drainAuditQueue", () => {
  it("waits for a write started by auditService.log", async () => {
    const write = deferred()
    nextWrite = write.promise
    auditService.log(entry)

    let drained = false
    const drain = drainAuditQueue().then(() => { drained = true })
    await new Promise((r) => setTimeout(r, 20))
    expect(drained).toBe(false)

    write.resolve()
    await drain
    expect(drained).toBe(true)
  })

  it("still drains when a write fails, without rejecting", async () => {
    const write = deferred()
    nextWrite = write.promise
    auditService.log(entry)

    const drain = drainAuditQueue()
    write.reject(new Error("db down"))
    await expect(drain).resolves.toBeUndefined()
  })

  it("returns at once when nothing is pending", async () => {
    await expect(drainAuditQueue()).resolves.toBeUndefined()
  })
})
