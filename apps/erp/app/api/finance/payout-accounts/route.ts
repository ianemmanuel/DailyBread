import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** GET /api/finance/payout-accounts — cross-vendor payout-account queue.
 *  Scope (country) is enforced by the backend; this just forwards filters. */
export async function GET(req: NextRequest) {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const qs = req.nextUrl.searchParams.toString()
    const res = await fetch(`${BACKEND}/admin/v1/finance/payout-accounts${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch (err) {
    console.error("[finance-payout-accounts-list]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
