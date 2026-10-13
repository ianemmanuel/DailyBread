import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST /api/food-tags/cuisines/image/presign
 *
 * A short-lived PUT URL so the browser uploads the original straight to
 * storage — the file never passes through this app or the API. The returned
 * key is submitted afterwards; the backend re-reads those bytes and decides
 * what they really are, because a declared content type is only a claim.
 */
export async function POST(req: NextRequest) {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/food-tags/cuisines/image/presign`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(await req.json()),
    })

    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ message: "Could not prepare the upload" }, { status: 500 })
  }
}
