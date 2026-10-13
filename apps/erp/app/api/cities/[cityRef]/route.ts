import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** PATCH /api/cities/[cityRef] — update name/timezone/latitude/longitude/status */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ cityRef: string }> },
) {
  try {
    const { cityRef } = await params
    const { getToken } = await auth()
    const token = await getToken()

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.text()

    const res = await fetch(`${BACKEND}/admin/v1/cities/${cityRef}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    })

    const data = await res.json()

    if (res.ok) {
      revalidateTag(`city-${cityRef}`, {})
      revalidateTag("cities", {})
    }

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[city-update]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
