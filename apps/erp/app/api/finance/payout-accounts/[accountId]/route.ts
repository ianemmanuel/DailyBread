import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

type P = { params: Promise<{ accountId: string }> }

export async function GET(_req: NextRequest, { params }: P) {
  const { accountId } = await params
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/finance/payout-accounts/${accountId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch (err) {
    console.error("[finance-payout-account-detail]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
