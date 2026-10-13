import type { NextRequest } from "next/server"
import { proxyToBackend } from "@/lib/api/proxy"

/** PUT /api/identity/users/[id]/assignment — role and scope together; clears every grant. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return proxyToBackend(req, `/admin/v1/users/${encodeURIComponent(id)}/assignment`, {
    label : "identity.assignment",
    expire: [`admin-user-${id}`, "admin-users", "admin-delegable"],
  })
}
