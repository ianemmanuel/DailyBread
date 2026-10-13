import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * PUT /api/food-tags/[kind]/[tagRef]/countries/[countryRef] — Body: { enabled }
 *
 * The per-country half of the catalog: the one mutation a country-scoped
 * vendor_ops admin can reach, since the backend checks the country is in their
 * scope rather than requiring GLOBAL.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; tagRef: string; countryRef: string }> },
) {
  const { kind, tagRef, countryRef } = await params
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/food-tags/${kind}/${tagRef}/countries/${countryRef}`, {
      method : "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(await req.json()),
    })

    const data = await res.json()
    if (res.ok) revalidateTag(`food-tags-${kind}`, {})

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[food-tags-country]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
