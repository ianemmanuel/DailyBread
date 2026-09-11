import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/*
 * GET /api/finance/payout-accounts/[accountId]/audit?page=
 *
 * One page of an account's audit trail. Never cached — the trail changes with
 * every action taken on the page it sits under, and a stale page here would
 * hide the entry the admin just created.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const page = req.nextUrl.searchParams.get("page") ?? "1"
    const res = await fetch(
      `${BACKEND}/admin/v1/finance/payout-accounts/${accountId}/audit?page=${encodeURIComponent(page)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[finance-payout-account-audit]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
