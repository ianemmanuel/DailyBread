import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * GET /api/vendors/applications/[id]/eligible-reviewers?for=reassign|escalate
 * Powers the reviewer picker in the Reassign and Escalate dialogs.
 */
export async function GET(
  req    : NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id }        = await params
    const { getToken }  = await auth()
    const token         = await getToken()

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const forParam = req.nextUrl.searchParams.get("for") === "escalate" ? "escalate" : "reassign"

    const res = await fetch(
      `${BACKEND}/admin/v1/vendors/applications/${id}/eligible-reviewers?for=${forParam}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[vendor-application-eligible-reviewers]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
