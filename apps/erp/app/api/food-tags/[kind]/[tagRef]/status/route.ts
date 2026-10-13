import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** PATCH /api/food-tags/[kind]/[tagRef]/status — suspend / reactivate / retire. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ kind: string; tagRef: string }> }) {
  const { kind, tagRef } = await params
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/food-tags/${kind}/${tagRef}/status`, {
      method : "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(await req.json()),
    })

    const data = await res.json()
    if (res.ok) revalidateTag(`food-tags-${kind}`, {})

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[food-tags-status]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
