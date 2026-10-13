import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * DELETE /api/vendor-types/[id]/countries/[countryRef]
 * Removes a vendor type's assignment to a country.
 */
export async function DELETE(
  _req    : NextRequest,
  { params }: { params: Promise<{ id: string; countryRef: string }> },
) {
  try {
    const { id, countryRef } = await params
    const { getToken }       = await auth()
    const token               = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/countries/${countryRef}/vendor-types/${id}`, {
      method : "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })

    const data = await res.json()
    if (res.ok) revalidateTag(`vendor-type-${id}`, {})

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[vendor-type-remove-country]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
