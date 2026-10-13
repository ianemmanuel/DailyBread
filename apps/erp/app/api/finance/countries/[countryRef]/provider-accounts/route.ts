import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

type P = { params: Promise<{ countryRef: string }> }

export async function GET(_req: NextRequest, { params }: P) {
  try {
    const { countryRef } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    const res = await fetch(`${BACKEND}/admin/v1/finance/countries/${countryRef}/provider-accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch (err) {
    console.error("[finance-provider-accounts-list]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: P) {
  try {
    const { countryRef } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    const res = await fetch(`${BACKEND}/admin/v1/finance/countries/${countryRef}/provider-accounts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: await req.text(),
    })
    const data = await res.json()
    if (res.ok) revalidateTag(`finance-country-config-${countryRef}`, {})
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[finance-provider-accounts-create]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
