import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST /api/marketing/hero-promotions/image/presign
 *
 * Returns a short-lived PUT URL so the browser uploads the original straight
 * to storage — the file never passes through this app or the API. The returned
 * storage key is submitted with the form; the backend re-reads those bytes and
 * decides what they really are.
 */
export async function POST(req: NextRequest) {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(
      `${BACKEND}/admin/v1/marketing/hero-promotions/image/presign`,
      {
        method : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body   : JSON.stringify(await req.json()),
      },
    )

    return NextResponse.json(await res.json(), { status: res.status })
  } catch (err) {
    console.error("[hero-promotion-presign]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
