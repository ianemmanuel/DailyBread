import type { NextRequest } from "next/server"
import { proxyToBackend } from "@/lib/api/proxy"

/*
 * PUT /api/identity/users/[id]/permissions/recovery — RECOVERY / BOOTSTRAP
 * (admin_users:permissions:recover). A separate route on purpose: the mode is
 * chosen by the URL the backend gates, never by a body field.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return proxyToBackend(req, `/admin/v1/users/${encodeURIComponent(id)}/permissions/recovery`, {
    label : "identity.permissions.recovery",
    expire: [`admin-user-${id}`, "admin-users", "admin-delegable"],
  })
}
