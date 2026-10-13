import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST /api/vendors/accounts/[id]/payout-accounts/[accountId]/[action]
 * Actions: verify | reject
 */
export async function POST(
  req    : NextRequest,
  { params }: { params: Promise<{ id: string; accountId: string; action: string }> },
) {
  try {
    const { id, accountId, action } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const allowedActions = ["verify", "reject"]
    if (!allowedActions.includes(action)) {
      return NextResponse.json({ message: "Invalid action" }, { status: 400 })
    }

    let body: object | undefined
    try { body = await req.json() } catch { body = undefined }

    const res = await fetch(
      `${BACKEND}/admin/v1/vendors/accounts/${id}/payout-accounts/${accountId}/${action}`,
      {
        method : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body   : body ? JSON.stringify(body) : undefined,
      },
    )

    const data = await res.json()
    if (res.ok) revalidateTag(`vendor-account-${id}`, {})
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[vendor-payout-account-action]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
