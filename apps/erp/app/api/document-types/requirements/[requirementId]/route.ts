import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * PATCH /api/document-types/requirements/[requirementId]
 * Toggles isRequired on a document-type <-> vendor-type link. Body: { isRequired }
 *
 * DELETE /api/document-types/requirements/[requirementId]
 * Unlinks a vendor type from a document type entirely.
 *
 * Both take an optional `documentTypeId` query param purely so this route
 * can invalidate that document type's detail cache — the backend itself
 * only needs the requirement id.
 */
export async function PATCH(
  req    : NextRequest,
  { params }: { params: Promise<{ requirementId: string }> },
) {
  try {
    const { requirementId } = await params
    const { getToken }      = await auth()
    const token               = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const documentTypeId = req.nextUrl.searchParams.get("documentTypeId")

    const res = await fetch(`${BACKEND}/admin/v1/document-types/requirements/${requirementId}`, {
      method : "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(body),
    })

    const data = await res.json()
    if (res.ok && documentTypeId) revalidateTag(`document-type-${documentTypeId}`, {})

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[document-type-requirement-update]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}

export async function DELETE(
  req    : NextRequest,
  { params }: { params: Promise<{ requirementId: string }> },
) {
  try {
    const { requirementId } = await params
    const { getToken }      = await auth()
    const token               = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const documentTypeId = req.nextUrl.searchParams.get("documentTypeId")

    const res = await fetch(`${BACKEND}/admin/v1/document-types/requirements/${requirementId}`, {
      method : "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })

    const data = await res.json().catch(() => ({}))
    if (res.ok && documentTypeId) revalidateTag(`document-type-${documentTypeId}`, {})

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[document-type-requirement-delete]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
