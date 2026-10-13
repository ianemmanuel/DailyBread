import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * GET   /api/finance/providers/[idOrCode]
 * PATCH /api/finance/providers/[idOrCode]  Body: { name?, capabilities?, methodTypes?, supportedCurrencies?, description? }
 */
export async function GET(
  _req   : NextRequest,
  { params }: { params: Promise<{ idOrCode: string }> },
) {
  try {
    const { idOrCode } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/finance/providers/${idOrCode}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[finance-provider-get]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}

export async function PATCH(
  req    : NextRequest,
  { params }: { params: Promise<{ idOrCode: string }> },
) {
  try {
    const { idOrCode } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const res = await fetch(`${BACKEND}/admin/v1/finance/providers/${idOrCode}`, {
      method : "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(body),
    })
    const data = await res.json()
    if (res.ok) revalidateTag("finance-providers", {})
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[finance-provider-update]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
