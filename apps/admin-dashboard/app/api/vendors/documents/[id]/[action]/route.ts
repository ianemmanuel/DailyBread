import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * Actions: approve | reject
 *
 * - approve: no body required
 * - reject:  body { rejectionReason: string, revisionNotes?: string }
 *
 * Proxies to Express backend with Clerk auth token.
 * Revalidates the parent vendor-application cache tag on success so the
 * document status badge refreshes on the detail page automatically.
 */
export async function POST(
  req    : NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const { id, action } = await params
    const { getToken }   = await auth()
    const token = await getToken()

    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const allowedActions = ["approve", "reject"]
    if (!allowedActions.includes(action)) {
      return NextResponse.json({ message: "Invalid action" }, { status: 400 })
    }

    // Forward request body (reject needs rejectionReason + optional revisionNotes)
    let body: object | undefined
    try { body = await req.json() } catch { body = undefined }

    const res = await fetch(
      `${BACKEND}/admin/v1/vendors/documents/${id}/${action}`,
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
      // The document belongs to an application — bust all application caches
      // so the status badge on the detail page reflects the new doc status.
      // We don't know the applicationId here, so we bust the broad tag.
      // If you store applicationId on the document row you can be more specific.
      revalidateTag("vendor-applications", "default")
    }

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[vendor-document-action]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}