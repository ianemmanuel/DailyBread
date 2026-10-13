import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** PATCH /api/tax/categories/[categoryId] — rename / re-describe. `code` is
 *  deliberately immutable backend-side, so it is not sent. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/tax/categories/${categoryId}`, {
      method : "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(await req.json()),
    })

    const data = await res.json()
    if (res.ok) revalidateTag("tax-categories", {})

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[tax-category-update]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
