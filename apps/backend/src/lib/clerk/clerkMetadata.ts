import { createClerkClient } from "@clerk/backend"
import { ClerkAppType } from "./clerkProjects"
import { VendorApplicationStatus } from "@repo/db"

/**
 * Returns a Clerk backend client for the given app type.
 *
 * Each Clerk instance has its own secret key. We cannot use a single
 * shared client because each client is bound to one instance's secret.
 *
 * Clients are lazy-created and cached per app type.
 */
const _clerkClients = new Map<ClerkAppType, ReturnType<typeof createClerkClient>>()

function getClerkClient(app: ClerkAppType) {
  if (_clerkClients.has(app)) return _clerkClients.get(app)!

  const secretKeyEnvVar = `CLERK_${app.toUpperCase()}_SECRET_KEY`
  const secretKey = process.env[secretKeyEnvVar]

  if (!secretKey) {
    throw new Error(`Missing env var: ${secretKeyEnvVar}`)
  }

  const client = createClerkClient({ secretKey })
  _clerkClients.set(app, client)
  return client
}

// ── Vendor-specific metadata ──────────────────────────────────────────────────

export class ClerkVendorStateService {
  private static get client() {
    return getClerkClient("vendor")
  }

  static async setVendorApplicationStatus(
    clerkUserId: string,
    status: VendorApplicationStatus
  ) {
    await this.client.users.updateUser(clerkUserId, {
      publicMetadata: { vendorApplicationStatus: status },
    })
  }

  static async clearVendorApplicationState(clerkUserId: string) {
    await this.client.users.updateUser(clerkUserId, {
      publicMetadata: { vendorApplicationStatus: null },
    })
  }
}

// ── Admin-specific metadata ───────────────────────────────────────────────────

export class ClerkAdminStateService {
  private static get client() {
    return getClerkClient("admin")
  }

  /**
   * Revoke all active sessions for an admin user.
   * Called immediately when an admin is deactivated or offboarded.
   * Ensures the user cannot complete any in-flight requests after deactivation.
   */
  static async revokeAllSessions(clerkUserId: string) {
    const sessions = await this.client.sessions.getSessionList({ userId: clerkUserId })
    await Promise.all(
      sessions.data
        .filter((s) => s.status === "active")
        .map((s) => this.client.sessions.revokeSession(s.id))
    )
  }
}