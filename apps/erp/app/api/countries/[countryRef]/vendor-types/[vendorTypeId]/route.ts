import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * DELETE /api/countries/[countryRef]/vendor-types/[vendorTypeId]
 * Removes a vendor type's assignment to this country.
 */
export async function DELETE(
  _req    : NextRequest,
  { params }: { params: Promise<{ countryRef: string; vendorTypeId: string }> },
) {
  try {
    const { countryRef, vendorTypeId } = await params
    const { getToken }                 = await auth()
    const token                         = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/countries/${countryRef}/vendor-types/${vendorTypeId}`, {
      method : "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })

    const data = await res.json()
    if (res.ok) revalidateTag(`country-${countryRef}`, {})

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[country-remove-vendor-type]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
