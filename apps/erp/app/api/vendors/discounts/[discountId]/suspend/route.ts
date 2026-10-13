import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** POST stops a vendor's offer; DELETE lifts the stop. Deliberately does NOT
 *  resume it — if the vendor had also paused it, that stays their decision. */
async function proxy(req: NextRequest, discountId: string, method: "POST" | "DELETE") {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/vendors/discounts/${discountId}/suspend`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify(await req.json()) } : {}),
    })

    const data = await res.json()
    if (res.ok) revalidateTag("admin-discounts", {})
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[admin-discount-suspend]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ discountId: string }> }) {
  const { discountId } = await params
  return proxy(req, discountId, "POST")
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ discountId: string }> }) {
  const { discountId } = await params
  return proxy(req, discountId, "DELETE")
}
