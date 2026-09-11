import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST /api/food-tags/[kind] — create a catalog entry.
 * The backend requires GLOBAL scope; a country-scoped admin gets a 403 with a
 * message explaining they can enable existing entries instead.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/food-tags/${kind}`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(await req.json()),
    })

    const data = await res.json()
    if (res.ok) revalidateTag(`food-tags-${kind}`, {})

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[food-tags-create]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
