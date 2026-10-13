import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** Admins who may take this payout review — narrowed to escalation
 *  receivers when the account is sitting in the open pool. */
export async function GET(_req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params
  const { getToken } = await auth()
  const token = await getToken()
  if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

  const res = await fetch(
    `${BACKEND}/admin/v1/finance/payout-accounts/${accountId}/eligible-targets`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  )
  return NextResponse.json(await res.json(), { status: res.status })
}
