import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** PATCH /api/notifications/read-all */
export async function PATCH() {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/notifications/read-all`, {
      method : "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[notifications-read-all]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
