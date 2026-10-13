import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST /api/countries/[countryRef]/vendor-types
 * Assigns a vendor type to this country. Mirrors
 * /api/vendor-types/[id]/countries — same backend endpoint, opposite side.
 */
export async function POST(
  req    : NextRequest,
  { params }: { params: Promise<{ countryRef: string }> },
) {
  try {
    const { countryRef } = await params
    const { getToken }   = await auth()
    const token           = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const { vendorTypeId } = await req.json()
    if (!vendorTypeId) return NextResponse.json({ message: "vendorTypeId is required" }, { status: 400 })

    const res = await fetch(`${BACKEND}/admin/v1/countries/${countryRef}/vendor-types`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify({ vendorTypeId }),
    })

    const data = await res.json()
    if (res.ok) revalidateTag(`country-${countryRef}`, {})

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[country-assign-vendor-type]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
