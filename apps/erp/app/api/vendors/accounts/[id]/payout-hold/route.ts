import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST   /api/vendors/accounts/[id]/payout-hold  — place a vendor-level payout hold
 * DELETE /api/vendors/accounts/[id]/payout-hold  — release it
 * CLAUDE.md #7 — designed, not enforced (no payout run exists to gate on yet).
 */
async function forward(id: string, method: "POST" | "DELETE", body: object | undefined, token: string) {
  const res = await fetch(`${BACKEND}/admin/v1/vendors/accounts/${id}/payout-hold`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body   : body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (res.ok) revalidateTag(`vendor-account-${id}`, {})
  return NextResponse.json(data, { status: res.status })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    let body: object | undefined
    try { body = await req.json() } catch { body = undefined }

    return await forward(id, "POST", body, token)
  } catch (err) {
    console.error("[vendor-payout-hold]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    return await forward(id, "DELETE", undefined, token)
  } catch (err) {
    console.error("[vendor-payout-hold]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
