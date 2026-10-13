import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * GET /api/countries?status=ACTIVE|INACTIVE
 * Proxies the country list — used client-side by ScopeSelector and any
 * client-rendered country pickers. Server Components should call
 * `adminFetch("/admin/v1/countries...")` directly instead of this route.
 */
export async function GET(req: NextRequest) {
  try {
    const { getToken } = await auth()
    const token = await getToken()

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const search = req.nextUrl.search
    const res = await fetch(`${BACKEND}/admin/v1/countries${search}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 300 },
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[countries-list]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
