import type { NextRequest } from "next/server"
import { proxyToBackend } from "@/lib/api/proxy"

/*
 * PUT /api/identity/users/[id]/permissions — ORDINARY DELEGATION
 * (admin_users:permissions:manage). The backend applies permission ownership;
 * the body is { permissionKeys } and nothing else.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return proxyToBackend(req, `/admin/v1/users/${encodeURIComponent(id)}/permissions`, {
    label : "identity.permissions",
    expire: [`admin-user-${id}`, "admin-users", "admin-delegable"],
  })
}
