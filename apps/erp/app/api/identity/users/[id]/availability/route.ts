import { auth } from "@clerk/nextjs/server"
import { revalidateTag }  from "next/cache"
import { NextRequest, NextResponse } from "next/server"


//* ─── PATCH /api/identity/users/[id]/availability ──────────────────────────

//? Marks an admin user available/unavailable via the backend API.
//? Expects { availability: "AVAILABLE"|"UNAVAILABLE", unavailableFrom?, unavailableUntil?, unavailableReason? }.

export async function PATCH(
  req    : NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const { getToken } = await auth()
    const token = await getToken()

    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()

    const res = await fetch(`${process.env.BACKEND_API_URL}/admin/v1/users/${id}/availability`, {
      method : "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(body),
    })

    const data = await res.json()

    if (res.ok) {
      revalidateTag(`admin-user-${id}`, "default")
      revalidateTag("admin-users", "default")
    }

    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
