import { auth }     from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * Route handler: GET /api/admin/roles/[roleId]/pool
 *
 * Proxies the role permission pool request to the backend.
 * Used by PermissionPicker client component — it can't call
 * the backend directly (no auth token in browser), so it
 * calls this Next.js route handler which forwards with the
 * server-side Clerk token.
 */
export async function GET(
  _req    : NextRequest,
  { params }: { params: Promise<{ roleId: string }> },
) {
  const { roleId }    = await params
  const { getToken }  = await auth()
  const token         = await getToken()

  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const res = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/users/meta/roles/${roleId}/pool`,
    {
      headers: { Authorization: `Bearer ${token}` },
      next   : { revalidate: 3600 },
    },
  )

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch pool" }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json({ permissions: data.data })
}