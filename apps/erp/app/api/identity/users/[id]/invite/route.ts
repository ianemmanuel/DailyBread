import type { NextRequest } from "next/server"
import { proxyToBackend } from "@/lib/api/proxy"

//* ─── POST /api/identity/users/[id]/invite ──────────────────────────
//? Sends or resends the Clerk invitation (conditional on the account still awaiting activation).
//? Tags are EXPIRED, not marked stale (bug class #18).

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return proxyToBackend(req, `/admin/v1/users/${encodeURIComponent(id)}/invite`, {
    label : "identity.invite",
    expire: [`admin-user-${id}`, "admin-users", "admin-delegable"],
  })
}
