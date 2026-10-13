import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

type P = { params: Promise<{ countryRef: string; op: string }> }

const PATCH_OPS = new Set(["bank-verification-account", "bank-verification-mode", "switches"])
const POST_OPS = new Set(["activate", "suspend", "disable", "restore"])

async function proxy(req: NextRequest, countryRef: string, op: string, method: "PATCH" | "POST") {
  const { getToken } = await auth()
  const token = await getToken()
  if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

  const body = method === "PATCH" || op === "suspend" ? await req.text() : undefined
  const res = await fetch(`${BACKEND}/admin/v1/finance/countries/${countryRef}/financial-config/${op}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body,
  })
  const data = await res.json()
  if (res.ok) {
    revalidateTag(`finance-country-config-${countryRef}`, {})
    revalidateTag(`country-${countryRef}`, {})
    revalidateTag("countries", {})
  }
  return NextResponse.json(data, { status: res.status })
}

export async function PATCH(req: NextRequest, { params }: P) {
  const { countryRef, op } = await params
  if (!PATCH_OPS.has(op)) return NextResponse.json({ message: "Invalid action" }, { status: 400 })
  try {
    return await proxy(req, countryRef, op, "PATCH")
  } catch (err) {
    console.error("[finance-country-config-patch]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: P) {
  const { countryRef, op } = await params
  if (!POST_OPS.has(op)) return NextResponse.json({ message: "Invalid action" }, { status: 400 })
  try {
    return await proxy(req, countryRef, op, "POST")
  } catch (err) {
    console.error("[finance-country-config-post]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
