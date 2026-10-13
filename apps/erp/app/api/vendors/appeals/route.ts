import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST /api/vendors/appeals
 * Body: { subjectType, applicationId?, vendorId?, reason }
 * Roadmap VM-P1-04 (CLAUDE.md).
 */
export async function POST(req: NextRequest) {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.json()

    const res = await fetch(`${BACKEND}/admin/v1/vendors/appeals`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(body),
    })

    const data = await res.json()
    if (res.ok) revalidateTag("vendor-appeals", {})
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[vendor-appeal-log]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
