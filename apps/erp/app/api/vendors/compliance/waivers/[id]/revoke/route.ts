import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST /api/vendors/compliance/waivers/[id]/revoke
 * Body: { reason? }
 */
export async function POST(
  req    : NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    let body: object | undefined
    try { body = await req.json() } catch { body = undefined }

    const res = await fetch(`${BACKEND}/admin/v1/vendors/compliance/waivers/${id}/revoke`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : body ? JSON.stringify(body) : undefined,
    })

    const data = await res.json()
    if (res.ok) revalidateTag("vendor-compliance", {})
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[compliance-waiver-revoke]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
