import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** GET /api/notifications?unreadOnly=&page=&pageSize= */
export async function GET(req: NextRequest) {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/notifications?${req.nextUrl.searchParams}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache  : "no-store",
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[notifications-list]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
