import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * PUT /api/food-tags/[kind]/countries/[countryRef]/all — Body: { enabled }
 *
 * Switch every active catalog entry on (or all of them off) for one country.
 * Country-wide policy, so the backend refuses a city-tier admin.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; countryRef: string }> },
) {
  const { kind, countryRef } = await params
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/food-tags/${kind}/countries/${countryRef}/all`, {
      method : "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(await req.json()),
    })

    const data = await res.json()
    if (res.ok) revalidateTag(`food-tags-${kind}`, {})

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[food-tags-bulk]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
