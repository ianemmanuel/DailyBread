import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"


//* ─── POST /api/identity/users ────────────────────────────

//? Creates a new user via the backend API. Expects { email, fullName, roleId } in body.

export async function POST(req: NextRequest) {
  const { getToken } = await auth()
  const token = await getToken()

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()

    if (!body.email || !body.fullName || !body.roleId) {
      return NextResponse.json(
        { status: "error", message: "email, fullName, and roleId are required" },
        { status: 400 }
      )
    }

    const res = await fetch(`${process.env.BACKEND_API_URL}/admin/v1/users`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()

    // ✅ revalidate the user list cache to include the new user
    if (res.ok) {
      revalidateTag("admin-users", "default")
    }

    return NextResponse.json(data, { status: res.status })

  } catch {
    return NextResponse.json(
      { status: "error", message: "Internal error" },
      { status: 500 }
    )
  }
}