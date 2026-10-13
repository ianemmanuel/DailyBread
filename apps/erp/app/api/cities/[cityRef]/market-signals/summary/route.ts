import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** GET /api/cities/[cityRef]/market-signals/summary */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cityRef: string }> },
) {
  try {
    const { cityRef } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/cities/${cityRef}/market-signals/summary`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[market-signals-summary]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
