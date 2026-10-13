import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * GET /api/vendors/compliance/cases/eligible-targets?vendorId=&for=reassign|escalate
 */
export async function GET(req: NextRequest) {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/vendors/compliance/cases/eligible-targets?${req.nextUrl.searchParams}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[compliance-case-eligible-targets]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
