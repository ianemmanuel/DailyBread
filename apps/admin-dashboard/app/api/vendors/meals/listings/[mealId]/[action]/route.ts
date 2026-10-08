import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/*
 * Marketplace controls on one listing — one handler for the four verbs, the
 * same shape as the dish moderation proxy. The allowlist mirrors the backend
 * route; the backend still decides permission, scope and the transition.
 */
const ALLOWED = new Set(["hide", "unhide", "suspend", "reinstate"])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ mealId: string; action: string }> },
) {
  try {
    const { mealId, action } = await params
    if (!ALLOWED.has(action)) {
      return NextResponse.json({ message: "Unknown action" }, { status: 404 })
    }

    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.text()
    const res = await fetch(`${BACKEND}/admin/v1/vendors/meals/listings/${mealId}/${action}`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : body || "{}",
    })

    const data = await res.json()
    // The dish queue's per-outlet badges read the same rows.
    if (res.ok) revalidateTag("vendor-meals", {})
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[meal-listing-action]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
