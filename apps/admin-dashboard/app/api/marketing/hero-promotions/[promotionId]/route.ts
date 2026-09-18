import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** PATCH /api/marketing/hero-promotions/[promotionId] — edit a promotion. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ promotionId: string }> },
) {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const { promotionId } = await params
    const res = await fetch(`${BACKEND}/admin/v1/marketing/hero-promotions/${promotionId}`, {
      method : "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(await req.json()),
    })

    const data = await res.json()
    if (res.ok) revalidateTag("hero-promotions", {})

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[hero-promotion-update]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
