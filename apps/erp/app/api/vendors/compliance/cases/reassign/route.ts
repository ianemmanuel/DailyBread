import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST /api/vendors/compliance/cases/reassign
 * Body: { vendorId, documentTypeId, issueType, targetAdminId, reason? }
 */
export async function POST(req: NextRequest) {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.json()

    const res = await fetch(`${BACKEND}/admin/v1/vendors/compliance/cases/reassign`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(body),
    })

    const data = await res.json()
    if (res.ok) revalidateTag("vendor-compliance", {})
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[compliance-case-reassign]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
