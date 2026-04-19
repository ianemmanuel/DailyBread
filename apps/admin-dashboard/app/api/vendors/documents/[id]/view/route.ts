import { auth }     from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

/**

 * Proxies to backend to generate a short-lived R2 signed URL.
 * The backend handler (vendor.document.controller.ts):
 *   - Checks VENDORS_DOCUMENTS_VIEW permission
 *   - Checks actor scope against the document's country
 *   - Calls R2Service.generateViewUrl(doc.storageKey)
 *   - Returns { data: { url: string } }
 */
export async function GET(
  _req    : NextRequest,
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

    return NextResponse.json(
      { url: data.data.url },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    )
  } catch (err) {
    console.error("[document-view]", err)
    return NextResponse.json({ message: "Internal error." }, { status: 500 })
  }
}