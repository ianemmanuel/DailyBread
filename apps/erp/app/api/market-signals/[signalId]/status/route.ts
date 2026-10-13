import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** PATCH /api/market-signals/[signalId]/status  { status } */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ signalId: string }> },
) {
  try {
    const { signalId } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.text()
    const cityRef = new URL(req.url).searchParams.get("cityRef")

    const res = await fetch(`${BACKEND}/admin/v1/market-signals/${signalId}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
    })
    const data = await res.json()

    if (res.ok && cityRef) {
      revalidateTag(`city-${cityRef}-signals`, {})
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[market-signal-status]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
