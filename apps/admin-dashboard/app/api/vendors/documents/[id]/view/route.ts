import { auth }     from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/admin/vendors/documents/[id]/view
 *
 * Issues a short-lived signed URL for a vendor document stored in R2.
 *
 * Security:
 *   1. Requires valid Clerk session (auth())
 *   2. Forwards to backend which checks VENDORS_READ permission
 *   3. Backend calls R2 presign (15-min TTL)
 *   4. Returns only the signed URL — client never sees storage keys
 *
 * The signed URL expires in 15 minutes.
 * No document is ever publicly accessible.
 */
export async function GET(
  _req   : NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id }       = await params
    const { getToken } = await auth()
    const token        = await getToken()

    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const res = await fetch(
      `${process.env.BACKEND_API_URL}/admin/v1/vendors/documents/${id}/signed-url`,
      { headers: { Authorization: `Bearer ${token}` } },
    )

    if (!res.ok) {
      const err = await res.json()
      return NextResponse.json(
        { message: err.message ?? "Could not generate preview URL." },
        { status: res.status },
      )
    }

    const data = await res.json()

    // Forward only what the client needs — not the raw storage key
    return NextResponse.json({ url: data.data.url }, {
      headers: {
        // Prevent caching of the signed URL response
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    })
  } catch {
    return NextResponse.json({ message: "Internal error." }, { status: 500 })
  }
}