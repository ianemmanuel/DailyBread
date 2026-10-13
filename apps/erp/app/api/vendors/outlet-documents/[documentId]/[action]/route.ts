import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL
const ALLOWED = ["approve", "reject", "signed-url"] as const

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string; action: string }> },
) {
  try {
    const { documentId, action } = await params
    if (!ALLOWED.includes(action as (typeof ALLOWED)[number]) || action === "signed-url") {
      return NextResponse.json({ message: "Invalid action" }, { status: 400 })
    }
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.text()
    const res = await fetch(`${BACKEND}/admin/v1/vendors/outlet-documents/${documentId}/${action}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body || undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      const outletId = new URL(req.url).searchParams.get("outletId")
      if (outletId) revalidateTag(`outlet-${outletId}`, {})
      revalidateTag("vendor-outlets-admin", {})
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[admin-outlet-doc-action]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ documentId: string; action: string }> },
) {
  try {
    const { documentId, action } = await params
    if (action !== "signed-url") return NextResponse.json({ message: "Invalid action" }, { status: 400 })
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/vendors/outlet-documents/${documentId}/signed-url`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[admin-outlet-doc-signed-url]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
