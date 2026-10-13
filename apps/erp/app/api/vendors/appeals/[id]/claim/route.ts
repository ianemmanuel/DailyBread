import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST /api/vendors/appeals/[id]/claim
 */
export async function POST(
  _req    : NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/vendors/appeals/${id}/claim`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}` },
    })

    const data = await res.json()
    if (res.ok) revalidateTag("vendor-appeals", {})
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[vendor-appeal-claim]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
