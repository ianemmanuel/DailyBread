import type { NextRequest } from "next/server"
import { proxyToBackend } from "@/lib/api/proxy"

/** PATCH /api/identity/users/[id]/profile — name and employee ID; the backend refuses an email. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return proxyToBackend(req, `/admin/v1/users/${encodeURIComponent(id)}/profile`, {
    label : "identity.profile",
    expire: [`admin-user-${id}`, "admin-users", "admin-delegable"],
  })
}
