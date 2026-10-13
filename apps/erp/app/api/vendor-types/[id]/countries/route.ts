import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST /api/vendor-types/[id]/countries
 * Assigns a vendor type to a country. Mounted on the backend's country
 * router (POST /admin/v1/countries/:countryRef/vendor-types) — this proxy
 * just takes the country id/slug in the body as `countryRef`.
 */
export async function POST(
  req    : NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id }        = await params
    const { getToken }  = await auth()
    const token          = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const { countryRef } = await req.json()
    if (!countryRef) return NextResponse.json({ message: "countryRef is required" }, { status: 400 })

    const res = await fetch(`${BACKEND}/admin/v1/countries/${countryRef}/vendor-types`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify({ vendorTypeId: id }),
    })

    const data = await res.json()
    if (res.ok) revalidateTag(`vendor-type-${id}`, {})

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[vendor-type-assign-country]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
