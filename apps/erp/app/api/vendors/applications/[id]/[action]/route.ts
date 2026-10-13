import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST /api/vendors/applications/[id]/[action]
 * Actions: review | approve | reject | needs-revision | claim | reassign | escalate
 */
export async function POST(
  req    : NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const { id, action } = await params
    const { getToken }   = await auth()
    const token          = await getToken()

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const allowedActions = ["review", "approve", "reject", "needs-revision", "claim", "reassign", "escalate"]
    if (!allowedActions.includes(action)) {
      return NextResponse.json({ message: "Invalid action" }, { status: 400 })
    }
    let body: object | undefined
    try { body = await req.json() } catch { body = undefined }

    const res = await fetch(
      `${BACKEND}/admin/v1/vendors/applications/${id}/${action}`,
      {
        method : "POST",
        headers: {
          Authorization : `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    )

    const data = await res.json()

    if (res.ok) {
      // Revalidate the application detail + list caches so the new status
      // shows up immediately (both are tagged in the fetches that built them).
      // Second arg is Next 16's mandatory cache-life profile — {} keeps the
      // tagged entries' existing revalidate window instead of overriding it.
      revalidateTag(`vendor-application-${id}`, {})
      revalidateTag("vendor-applications", {})
    }

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[vendor-application-action]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}