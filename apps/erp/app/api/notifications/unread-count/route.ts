import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** GET /api/notifications/unread-count — polled by the navbar bell. */
export async function GET() {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${token}` },
      cache  : "no-store",
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[notifications-unread-count]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
