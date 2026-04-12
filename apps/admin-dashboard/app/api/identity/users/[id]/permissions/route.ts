import { auth } from "@clerk/nextjs/server"
import { revalidateTag }  from "next/cache"
import { NextRequest, NextResponse } from "next/server"


//* ─── PUT /api/identity/users/[id]/permissions ──────────────────────────

//? Updates a user's permissions via the backend API. Expects { permissions: string[] } in body.

export async function PUT(
  req    : NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const { id, action } = await params

    if (action !== "permissions") {
      return NextResponse.json({ error: "Invalid" }, { status: 400 })
    }

    const { getToken } = await auth()
    const token = await getToken()

    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()

    const res = await fetch(`${process.env.BACKEND_API_URL}/admin/v1/users/${id}/permissions`, {
      method : "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(body),
    })

    const data = await res.json()

    //* invalidate this user's cache to update permissions
    if (res.ok) revalidateTag(`admin-user-${id}`,"default") 

    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}