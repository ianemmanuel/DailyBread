import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/*
 * One handler for every meal moderation action, since they share a shape: POST
 * with an optional JSON body, and the same revalidation afterwards. A route
 * file per verb would be three near-identical copies.
 */
const ALLOWED = new Set(["approve", "send-back", "status"])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string; op: string }> },
) {
  try {
    const { itemId, op } = await params
    if (!ALLOWED.has(op)) {
      return NextResponse.json({ message: "Unknown action" }, { status: 404 })
    }

    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.text()
    const res = await fetch(`${BACKEND}/admin/v1/vendors/meals/${itemId}/${op}`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : body || "{}",
    })

    const data = await res.json()
    if (res.ok) {
      revalidateTag("vendor-meals", {})
      revalidateTag(`vendor-meal-${itemId}`, {})
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[vendor-meal-action]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
