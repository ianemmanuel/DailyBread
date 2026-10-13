import { beforeEach, describe, expect, it, vi } from "vitest"

const invitations = {
  createInvitation  : vi.fn(),
  getInvitationList : vi.fn(),
  revokeInvitation  : vi.fn(),
}
vi.mock("@clerk/backend", () => ({ createClerkClient: () => ({ invitations }) }))
vi.mock("@repo/db", () => ({ VendorApplicationStatus: {} }))
vi.mock("@/env", () => ({ env: { CLERK_ADMIN_SECRET_KEY: "sk_test" } }))
vi.mock("@/lib/pino/logger", () => {
  const silent: any = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
  silent.child = () => silent
  return { logger: silent }
})

const { ClerkAdminStateService } = await import("./clerkMetadata")

const send = () => ClerkAdminStateService.createInvitation({
  emailAddress: "Hire@Example.test", redirectUrl: "https://erp.example.test/sign-up", publicMetadata: {}, expiresInDays: 30,
})

beforeEach(() => {
  for (const fn of Object.values(invitations)) fn.mockReset()
  invitations.createInvitation.mockResolvedValue({ id: "inv-new" })
  invitations.revokeInvitation.mockResolvedValue({})
})

describe("ClerkAdminStateService.createInvitation (send and resend)", () => {
  it("creates past an existing pending invitation instead of failing with duplicate_record", async () => {
    invitations.getInvitationList.mockResolvedValue({ data: [] })
    await send()
    expect(invitations.createInvitation).toHaveBeenCalledWith(expect.objectContaining({ ignoreExisting: true, notify: true }))
  })

  it("then revokes every OTHER pending invitation for exactly that address, leaving the newest link live", async () => {
    invitations.getInvitationList.mockResolvedValue({ data: [
      { id: "inv-new", emailAddress: "hire@example.test" },
      { id: "inv-old", emailAddress: "hire@example.test" },
      { id: "inv-other", emailAddress: "rehire@example.test" }, // `query` is a substring match
    ] })
    expect(await send()).toEqual({ id: "inv-new" })
    expect(invitations.revokeInvitation.mock.calls.map((c) => c[0])).toEqual(["inv-old"])
  })

  it("a failed revoke does not fail a send that already went out", async () => {
    invitations.getInvitationList.mockResolvedValue({ data: [{ id: "inv-old", emailAddress: "hire@example.test" }] })
    invitations.revokeInvitation.mockRejectedValue(new Error("clerk down"))
    await expect(send()).resolves.toEqual({ id: "inv-new" })
  })
})
