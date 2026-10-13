import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST /api/document-types/[id]/vendor-types
 * Links a document type to a vendor type. Body: { vendorTypeId, isRequired? }
 */
export async function POST(
  req    : NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id }        = await params
    const { getToken }  = await auth()
    const token          = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.json()

    const res = await fetch(`${BACKEND}/admin/v1/document-types/${id}/vendor-types`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(body),
    })

    const data = await res.json()
    if (res.ok) revalidateTag(`document-type-${id}`, {})

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[document-type-link-vendor-type]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
