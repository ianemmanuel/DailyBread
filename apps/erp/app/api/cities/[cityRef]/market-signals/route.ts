import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** GET /api/cities/[cityRef]/market-signals?type=&status=&zoneId=&page=&pageSize= */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cityRef: string }> },
) {
  try {
    const { cityRef } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const qs = new URL(req.url).searchParams.toString()
    const res = await fetch(`${BACKEND}/admin/v1/cities/${cityRef}/market-signals${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[market-signals-list]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}

/** POST /api/cities/[cityRef]/market-signals — log a signal */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cityRef: string }> },
) {
  try {
    const { cityRef } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.text()
    const res = await fetch(`${BACKEND}/admin/v1/cities/${cityRef}/market-signals`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
    })
    const data = await res.json()

    if (res.ok) {
      revalidateTag(`city-${cityRef}-signals`, {})
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[market-signals-create]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
