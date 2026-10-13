import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { proxyToBackend } from "@/lib/api/proxy"

//* ─── POST /api/identity/users/[id]/[action] ────────────────────────────
//? Handles: invite | suspend | reinstate | reactivate | deactivate

const ALLOWED_POST = new Set(["invite", "suspend", "reinstate", "reactivate", "deactivate"])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params
  if (!ALLOWED_POST.has(action)) {
    return NextResponse.json({ message: "Invalid action" }, { status: 400 })
  }
  // Expired, not merely marked stale (bug class #18): the detail page must
  // show the new status on the refresh that follows the action.
  return proxyToBackend(req, `/admin/v1/users/${encodeURIComponent(id)}/${action}`, {
    label : `identity.${action}`,
    expire: ["admin-users", `admin-user-${id}`, "admin-delegable"],
  })
}
