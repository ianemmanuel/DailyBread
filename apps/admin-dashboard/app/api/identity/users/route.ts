import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

//* ─── POST /api/identity/users ────────────────────────────

export async function POST(req: NextRequest) {
  const { getToken } = await auth()
  const token = await getToken()

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()

    const {
      firstName,
      middleName,
      lastName,
      email,
      employeeId,
      roleId,
      permissionKeys,
      scopes,
    } = body

    // ✅ Updated validation
    if (!firstName || !lastName || !email || !roleId) {
      return NextResponse.json(
        {
          status: "error",
          message: "firstName, lastName, email, and roleId are required",
        },
        { status: 400 }
      )
    }

    // ✅ Normalize payload (match backend expectations exactly)
    const payload = {
      firstName : firstName.trim(),
      middleName: middleName?.trim() || undefined,
      lastName  : lastName.trim(),
      email     : email.trim(),
      employeeId: employeeId?.trim() || undefined,
      roleId,
      permissionKeys: permissionKeys ?? [],
      scopes        : scopes ?? undefined,
    }

    const res = await fetch(
      `${process.env.BACKEND_API_URL}/admin/v1/users`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    )

    const data = await res.json()

    // ✅ Revalidate users list
    if (res.ok) {
      revalidateTag("admin-users","default")
    }

    return NextResponse.json(data, { status: res.status })

  } catch {
    return NextResponse.json(
      { status: "error", message: "Internal error" },
      { status: 500 }
    )
  }
}