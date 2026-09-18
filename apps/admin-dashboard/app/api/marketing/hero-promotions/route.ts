import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST /api/marketing/hero-promotions — create a draft promotion.
 *
 * A thin proxy: it attaches the Clerk token and forwards the body untouched.
 * Permission and geographic scope are decided by the backend, which is the
 * only place that can — the UI merely hides controls a caller cannot use.
 */
export async function POST(req: NextRequest) {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/marketing/hero-promotions`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(await req.json()),
    })

    const data = await res.json()
    if (res.ok) revalidateTag("hero-promotions", {})

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[hero-promotion-create]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
