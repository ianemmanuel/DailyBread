import { createClerkClient } from "@clerk/backend"
import { VendorApplicationStatus } from "@repo/db"

import { env } from "@/env"
import { logger } from "@/lib/pino/logger"

const clerkLog = logger.child({ module: "clerk-metadata" })

/*
 * Vendor, admin and customer have a Clerk backend client; courier stays
 * JWKS-verify-only by design (see env.ts). Narrowing the type here means
 * calling getClerkClient("courier") is a compile error, not a "missing env
 * var" surprise at runtime.
 *
 * The CUSTOMER client was added for one reason: suspending a customer has to
 * revoke their sessions at the provider. Verifying tokens needs only JWKS, but
 * ACTING on an identity needs a secret key, and a suspension that leaves the
 * person signed in until their token expires is not a suspension.
 */
type ClientAppType = "vendor" | "admin" | "customer"

const _clerkClients = new Map<ClientAppType, ReturnType<typeof createClerkClient>>()

function getClerkClient(app: ClientAppType) {
  if (_clerkClients.has(app)) return _clerkClients.get(app)!

  const secretKey =
    app === "vendor"   ? env.CLERK_VENDOR_SECRET_KEY   :
    app === "customer" ? env.CLERK_CUSTOMER_SECRET_KEY :
                         env.CLERK_ADMIN_SECRET_KEY

  const client = createClerkClient({ secretKey })
  _clerkClients.set(app, client)
  return client
}

//* Vendor-specific metadata

export class ClerkVendorStateService {
  private static get client() {
    return getClerkClient("vendor")
  }

  /**
   * Mirrors vendor application status into Clerk's publicMetadata so
   * the frontend can read it straight off the session without an
   * extra API call. Postgres remains the source of truth — nothing
   * on the backend ever reads this value back. A failure here is
   * logged, not thrown: the Postgres write this is called after has
   * already succeeded, and failing the whole request over a
   * best-effort read-optimization would make a successful operation
   * look failed to the caller.
   */
  static async setVendorApplicationStatus(
    clerkUserId: string,
    status: VendorApplicationStatus
  ) {
    try {
      await this.client.users.updateUser(clerkUserId, {
        publicMetadata: { vendorApplicationStatus: status },
      })
    } catch (err) {
      clerkLog.warn({ err, clerkUserId, status }, "Failed to mirror vendor application status to Clerk")
    }
  }

  static async clearVendorApplicationState(clerkUserId: string) {
    try {
      await this.client.users.updateUser(clerkUserId, {
        publicMetadata: { vendorApplicationStatus: null },
      })
    } catch (err) {
      clerkLog.warn({ err, clerkUserId }, "Failed to clear vendor application state in Clerk")
    }
  }

  /**
   * Bans the user — Clerk revokes all their active sessions as a
   * side effect and blocks future sign-in. Used by admin's banVendor.
   * Propagates errors rather than swallowing them; the caller decides
   * how to handle a Clerk failure (banVendor treats it as best-effort
   * once the DB-level ban has already succeeded).
   */
  static async banUser(clerkUserId: string) {
    return this.client.users.banUser(clerkUserId)
  }

  /** Reverses banUser. Used by admin's unbanVendor. */
  static async unbanUser(clerkUserId: string) {
    return this.client.users.unbanUser(clerkUserId)
  }
}

// ── Admin-specific state ──────────────────────────────────────────────────────
//
// Every admin-Clerk mutation lives here — this is the ONLY place in the
// codebase that should construct an admin Clerk client. admin.user.service.ts
// and the admin Clerk webhook service both call into this instead of
// building their own client, which is what happened before this consolidation
// (three independent client constructions for the same Clerk instance).

export class ClerkAdminStateService {
  private static get client() {
    return getClerkClient("admin")
  }

  /**
   * Revoke all active sessions for an admin user without banning them
   * — e.g. "force re-login everywhere" without blocking future sign-in.
   * Note: banUser() already revokes all sessions as a side effect
   * (confirmed via Clerk's own docs), so this is NOT needed as part
   * of suspend/deactivate — those call banUser/deleteUser directly.
   * This throws on failure — a failed revocation is security-relevant,
   * not a cosmetic sync issue.
   */
  static async revokeAllSessions(clerkUserId: string) {
    const sessions = await this.client.sessions.getSessionList({ userId: clerkUserId })
    await Promise.all(
      sessions.data
        .filter((s) => s.status === "active")
        .map((s) => this.client.sessions.revokeSession(s.id))
    )
  }

  /**
   * Bans the user — Clerk revokes all their active sessions as a
   * side effect and blocks future sign-in. Used by suspendAdminUser.
   */
  static async banUser(clerkUserId: string) {
    return this.client.users.banUser(clerkUserId)
  }

  /** Reverses banUser. Used by reinstateAdminUser. */
  static async unbanUser(clerkUserId: string) {
    return this.client.users.unbanUser(clerkUserId)
  }

  /**
   * Permanently deletes the Clerk identity. Used by deactivateAdminUser
   * (deliberate — deactivation is not reversible the way suspension is)
   * and by the admin webhook service to clean up unauthorized/ineligible
   * signups.
   */
  static async deleteUser(clerkUserId: string) {
    return this.client.users.deleteUser(clerkUserId)
  }

  /** Used by sendAdminInvitation. */
  static async createInvitation(params: {
    emailAddress  : string
    redirectUrl   : string
    publicMetadata: Record<string, unknown>
    expiresInDays : number
  }) {
    return this.client.invitations.createInvitation({
      emailAddress  : params.emailAddress,
      redirectUrl   : params.redirectUrl,
      publicMetadata: params.publicMetadata,
      expiresInDays : params.expiresInDays,
      notify        : true,
    })
  }
}

//* Customer-specific identity actions

/**
 * Acting on a CUSTOMER's identity at the provider.
 *
 * Postgres stays the source of truth: `ConsumerStatus` is what every request
 * is checked against, freshly, so a suspension takes effect on the very next
 * call whether or not this succeeds. What the provider adds is session
 * revocation — without it a suspended customer keeps a valid token until it
 * expires, and would keep browsing as though nothing had happened.
 *
 * Unlike the vendor and admin services, this one may be UNCONFIGURED: the
 * customer secret key is optional so nobody is blocked by it. It therefore
 * says so loudly rather than pretending to have worked.
 */
export class ClerkCustomerStateService {
  private static get client() {
    return getClerkClient("customer")
  }

  static get isConfigured(): boolean {
    return env.CLERK_CUSTOMER_SECRET_KEY.length > 0
  }

  /** Throws with the exact cause, so a half-applied suspension is never
   *  reported as a clean one. */
  static assertConfigured(): void {
    if (!this.isConfigured) {
      throw new Error(
        "CLERK_CUSTOMER_SECRET_KEY is not set — a customer's sessions cannot be revoked without it",
      )
    }
  }

  /** Bans at the provider, which also revokes every live session. */
  static async banUser(externalAuthId: string) {
    this.assertConfigured()
    return this.client.users.banUser(externalAuthId)
  }

  static async unbanUser(externalAuthId: string) {
    this.assertConfigured()
    return this.client.users.unbanUser(externalAuthId)
  }
}
