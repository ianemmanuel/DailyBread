import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * GET  /api/finance/providers?search=&status=&page=&pageSize=
 * POST /api/finance/providers  Body: { code, name, capabilities, methodTypes?, supportedCurrencies?, description? }
 *
 * Thin proxy to /admin/v1/finance/providers — the backend enforces
 * finance:configuration:read / :manage + global scope.
 */
export async function GET(req: NextRequest) {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/finance/providers?${req.nextUrl.searchParams}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[finance-providers-list]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const res = await fetch(`${BACKEND}/admin/v1/finance/providers`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(body),
    })
    const data = await res.json()
    if (res.ok) revalidateTag("finance-providers", {})
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[finance-providers-create]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
