import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

type P = { params: Promise<{ accountId: string; op: string }> }

// Decision actions plus the review-workflow hand-offs. escalate/reassign
// carry a body; claim/release/verify don't.
const OPS = new Set([
  "verify", "reject", "claim", "release", "escalate", "reassign",
  // Post-decision, where reject would misrecord a completed verification as a
  // failure: take the account out of service, or ask a senior in-country
  // reviewer to look again without changing anything.
  "deactivate", "flag",
])
const OPS_WITH_BODY = new Set(["reject", "escalate", "reassign", "deactivate", "flag"])

export async function POST(req: NextRequest, { params }: P) {
  const { accountId, op } = await params
  if (!OPS.has(op)) return NextResponse.json({ message: "Invalid action" }, { status: 400 })
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = OPS_WITH_BODY.has(op) ? await req.text() : undefined
    const res = await fetch(`${BACKEND}/admin/v1/finance/payout-accounts/${accountId}/${op}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body,
    })
    const data = await res.json()
    if (res.ok) {
      revalidateTag("finance-payout-accounts", {})
      revalidateTag("vendor-accounts", {})
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[finance-payout-account-review]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
