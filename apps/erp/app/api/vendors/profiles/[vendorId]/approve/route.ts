import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST /api/vendors/profiles/[vendorId]/approve
 */
export async function POST(
  _req    : NextRequest,
  { params }: { params: Promise<{ vendorId: string }> },
) {
  try {
    const { vendorId } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/vendors/profiles/${vendorId}/approve`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })

    const data = await res.json()
    if (res.ok) revalidateTag("vendor-profiles", {})
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[vendor-profile-approve]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
