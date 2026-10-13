import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

type P = { params: Promise<{ accountId: string; op: string }> }

const OPS = new Set(["activate", "suspend", "disable", "restore", "test-bank-list"])
// A read-only diagnostic — no cache to invalidate afterwards.
const NON_MUTATING_OPS = new Set(["test-bank-list"])

export async function POST(req: NextRequest, { params }: P) {
  const { accountId, op } = await params
  if (!OPS.has(op)) return NextResponse.json({ message: "Invalid action" }, { status: 400 })
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = op === "suspend" ? await req.text() : undefined
    const res = await fetch(`${BACKEND}/admin/v1/finance/provider-accounts/${accountId}/${op}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body,
    })
    const data = await res.json()
    if (res.ok && !NON_MUTATING_OPS.has(op)) revalidateTag("finance-country-config", {})
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[finance-provider-account-op]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
