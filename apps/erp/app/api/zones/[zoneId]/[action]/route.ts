import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

const ALLOWED = ["level", "operational-status", "activate", "deactivate"] as const

/**
 * POST /api/zones/[zoneId]/[action]  (action ∈ level | operational-status | activate | deactivate)
 * All map to a backend PATCH on /admin/v1/zones/:zoneId/:action.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ zoneId: string; action: string }> },
) {
  try {
    const { zoneId, action } = await params
    if (!ALLOWED.includes(action as (typeof ALLOWED)[number])) {
      return NextResponse.json({ message: "Invalid action" }, { status: 400 })
    }

    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const cityRef = searchParams.get("cityRef")
    const body = await req.text()

    const res = await fetch(`${BACKEND}/admin/v1/zones/${zoneId}/${action}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body || undefined,
    })
    const data = await res.json().catch(() => ({}))

    if (res.ok && cityRef) {
      revalidateTag(`city-${cityRef}`, {})
      revalidateTag(`city-${cityRef}-zones`, {})
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[zone-action]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
