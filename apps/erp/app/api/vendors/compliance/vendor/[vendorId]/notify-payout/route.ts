import { auth }          from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** POST /api/vendors/compliance/vendor/:vendorId/notify-payout */
export async function POST(
  _req    : NextRequest,
  { params }: { params: Promise<{ vendorId: string }> },
) {
  try {
    const { vendorId } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/vendors/compliance/vendor/${vendorId}/notify-payout`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[compliance-notify-payout]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
