import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/*
 * Option-group moderation — the same shape as the meal actions next door. A
 * group verdict moves every dish using it, so the whole meals list is purged,
 * not one meal's tag. Permission and scope are the backend's to enforce.
 */
const ALLOWED = new Set(["approve", "send-back"])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string; op: string }> },
) {
  try {
    const { groupId, op } = await params
    if (!ALLOWED.has(op)) {
      return NextResponse.json({ message: "Unknown action" }, { status: 404 })
    }

    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.text()
    const res = await fetch(`${BACKEND}/admin/v1/vendors/meals/modifier-groups/${groupId}/${op}`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : body || "{}",
    })

    const data = await res.json()
    if (res.ok) revalidateTag("vendor-meals", {})
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[vendor-meal-group-action]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
