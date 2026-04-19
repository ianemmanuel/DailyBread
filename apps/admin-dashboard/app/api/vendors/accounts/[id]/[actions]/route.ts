import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST /api/admin/vendors/accounts/[id]/[action]
 * Actions: suspend | reinstate | ban
 */
export async function POST(
  req    : NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const { id, action } = await params
    const { getToken }   = await auth()
    const token = await getToken()

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const allowedActions = ["suspend", "reinstate", "ban"]
    if (!allowedActions.includes(action)) {
      return NextResponse.json({ message: "Invalid action" }, { status: 400 })
    }

    let body: object | undefined
    try { body = await req.json() } catch { body = undefined }

    const res = await fetch(
      `${BACKEND}/admin/v1/vendors/accounts/${id}/${action}`,
      {
        method : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body   : body ? JSON.stringify(body) : undefined,
      },
    )

    const data = await res.json()
    if (res.ok) {
      revalidateTag("vendor-accounts","default")
      revalidateTag(`vendor-account-${id}`,"default")
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[vendor-account-action]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}