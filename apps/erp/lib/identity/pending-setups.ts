import { adminFetch } from "@/lib/api"
import { AdminPermissions, type AdminSessionData } from "@repo/types/admin-app"
import { getScopeTier } from "@/lib/auth/scope-tier"
import type { PendingSetupSummary } from "@/types"

/**
 * The navigation count of pending permission setups for this viewer, or null
 * when it does not apply (no management or recovery key, CITY tier) or could
 * not be read — a failed read shows no badge rather than a false zero.
 * Uncached: it must change as soon as a setup is completed elsewhere.
 */
export async function getPendingSetupAttention(session: AdminSessionData): Promise<number | null> {
  const may = session.permissions.includes(AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE)
    || session.permissions.includes(AdminPermissions.ADMIN_USERS_PERMISSIONS_RECOVER)
  if (!may || getScopeTier(session) === "CITY") return null
  try {
    const summary = await adminFetch<PendingSetupSummary>("/admin/v1/users/permission-setup/summary", { cache: "no-store" })
    return summary.attention
  } catch {
    return null
  }
}
