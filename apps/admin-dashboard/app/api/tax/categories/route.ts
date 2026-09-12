import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** POST /api/tax/categories — create a catalog entry. Global scope only,
 *  enforced backend-side; the UI hides the control for anyone else. */
export async function POST(req: NextRequest) {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/tax/categories`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(await req.json()),
    })

    const data = await res.json()
    if (res.ok) revalidateTag("tax-categories", {})

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[tax-category-create]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
