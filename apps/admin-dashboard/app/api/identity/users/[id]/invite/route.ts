import { auth } from "@clerk/nextjs/server"
import { revalidateTag }  from "next/cache"
import { NextRequest, NextResponse } from "next/server"

/**
 * POST /api/admin/identity/users/[id]/invite
 * Proxies to backend, revalidates cache on success.
 */
export async function POST(
  _req   : NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id }       = await params
    const { getToken } = await auth()
    const token        = await getToken()

    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${process.env.BACKEND_API_URL}/admin/v1/users/${id}/invite`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })

    const data = await res.json()
    if (res.ok) {
      revalidateTag("admin-users", "default")
      revalidateTag(`admin-user-${id}`, "default")
    }

    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}