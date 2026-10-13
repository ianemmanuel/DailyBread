import type { NextRequest } from "next/server"
import { proxyToBackend } from "@/lib/api/proxy"

//* ─── PATCH /api/identity/users/[id]/scopes ──────────────────────────
//? Re-scopes an admin. The backend clears every grant on a scope change.
//? Tags are EXPIRED, not marked stale (bug class #18).

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return proxyToBackend(req, `/admin/v1/users/${encodeURIComponent(id)}/scopes`, {
    label : "identity.scopes",
    expire: [`admin-user-${id}`, "admin-users", "admin-delegable"],
  })
}
