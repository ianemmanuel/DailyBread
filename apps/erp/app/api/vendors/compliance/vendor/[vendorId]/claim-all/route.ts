import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** POST /api/vendors/compliance/vendor/:vendorId/claim-all */
export async function POST(
  _req    : NextRequest,
  { params }: { params: Promise<{ vendorId: string }> },
) {
  try {
    const { vendorId } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/vendors/compliance/vendor/${vendorId}/claim-all`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })

    const data = await res.json()
    if (res.ok) { revalidateTag("vendor-compliance", {}); revalidateTag(`vendor-compliance-${vendorId}`, {}) }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[compliance-claim-all]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
