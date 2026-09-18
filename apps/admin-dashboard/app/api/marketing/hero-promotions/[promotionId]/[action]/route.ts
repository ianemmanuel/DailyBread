import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/*
 * POST /api/marketing/hero-promotions/[promotionId]/[action]
 *
 * `publish` and `archive` only. The allow-list matters: without it this route
 * would forward any path segment a caller invented straight to the backend.
 */
const ALLOWED = new Set(["publish", "archive"])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ promotionId: string; action: string }> },
) {
  try {
    const { promotionId, action } = await params
    if (!ALLOWED.has(action)) {
      return NextResponse.json({ message: "Unknown action" }, { status: 404 })
    }

    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    /* publish takes an optional body; archive takes none. */
    let body = "{}"
    try {
      body = JSON.stringify(await req.json())
    } catch {
      /* no body sent — send an empty object so the backend's schema parses */
    }

    const res = await fetch(
      `${BACKEND}/admin/v1/marketing/hero-promotions/${promotionId}/${action}`,
      {
        method : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body,
      },
    )

    const data = await res.json()
    if (res.ok) revalidateTag("hero-promotions", {})

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[hero-promotion-action]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
