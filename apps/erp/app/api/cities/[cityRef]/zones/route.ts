import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** GET /api/cities/[cityRef]/zones — operational zones in this city */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cityRef: string }> },
) {
  try {
    const { cityRef } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/cities/${cityRef}/zones`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[city-zones-list]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}

/** POST /api/cities/[cityRef]/zones — create a zone (name, boundary, level?) */
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
    const res = await fetch(`${BACKEND}/admin/v1/cities/${cityRef}/zones`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
    })
    const data = await res.json()

    if (res.ok) {
      revalidateTag(`city-${cityRef}`, {})
      revalidateTag(`city-${cityRef}-zones`, {})
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[city-zones-create]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
