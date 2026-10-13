import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

type P = { params: Promise<{ accountId: string }> }

export async function GET(_req: NextRequest, { params }: P) {
  try {
    const { accountId } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    const res = await fetch(`${BACKEND}/admin/v1/finance/provider-accounts/${accountId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch (err) {
    console.error("[finance-provider-account-get]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: P) {
  try {
    const { accountId } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    const res = await fetch(`${BACKEND}/admin/v1/finance/provider-accounts/${accountId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: await req.text(),
    })
    const data = await res.json()
    if (res.ok) revalidateTag("finance-country-config", {})
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[finance-provider-account-update]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
