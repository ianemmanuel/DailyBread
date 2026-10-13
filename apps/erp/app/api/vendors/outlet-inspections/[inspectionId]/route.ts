import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ inspectionId: string }> },
) {
  try {
    const { inspectionId } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/vendors/outlet-inspections/${inspectionId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[admin-outlet-inspection-detail]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
