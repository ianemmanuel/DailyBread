import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST /api/vendors/compliance/waivers
 * Body: { vendorId, documentTypeId, reason, expiresAt }
 */
export async function POST(req: NextRequest) {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.json()

    const res = await fetch(`${BACKEND}/admin/v1/vendors/compliance/waivers`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(body),
    })

    const data = await res.json()
    if (res.ok) {
      revalidateTag("vendor-compliance", {})
      if (body?.vendorId) revalidateTag(`vendor-account-${body.vendorId}`, {})
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[compliance-waiver-create]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
