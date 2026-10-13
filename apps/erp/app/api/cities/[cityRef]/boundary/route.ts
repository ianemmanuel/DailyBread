import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** GET /api/cities/[cityRef]/boundary — the city operational boundary polygon */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cityRef: string }> },
) {
  try {
    const { cityRef } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/cities/${cityRef}/boundary`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[city-boundary-get]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}

/** POST /api/cities/[cityRef]/boundary — save the boundary (GeoJSON + source) */
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
    const res = await fetch(`${BACKEND}/admin/v1/cities/${cityRef}/boundary`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
    })
    const data = await res.json()

    if (res.ok) {
      revalidateTag(`city-${cityRef}`, {})
      revalidateTag(`city-${cityRef}-boundary`, {})
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[city-boundary-save]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}

/** DELETE /api/cities/[cityRef]/boundary — clear the boundary */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ cityRef: string }> },
) {
  try {
    const { cityRef } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/cities/${cityRef}/boundary`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()

    if (res.ok) {
      revalidateTag(`city-${cityRef}`, {})
      revalidateTag(`city-${cityRef}-boundary`, {})
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[city-boundary-clear]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
