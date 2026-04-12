import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"

//* ─── POST /api/identity/users/[id]/[action] ────────────────────────────
//? Handles: invite | suspend | reinstate | deactivate

const ALLOWED_POST = new Set(["invite", "suspend", "reinstate", "deactivate"])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await params
  const { getToken } = await auth()
  const token = await getToken()

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!ALLOWED_POST.has(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  }

  let body: string | undefined
  try {
    body = JSON.stringify(await req.json())
  } catch {
    // no body
  }

  const res = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/users/${id}/${action}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    }
  )

  const data = await res.json()

  // ✅ invalidate cached data for this user and the user list
  if (res.ok) {
    revalidateTag("admin-users", "default")
    revalidateTag(`admin-user-${id}`, "default")
  }

  return NextResponse.json(data, { status: res.status })
}