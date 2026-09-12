import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** PATCH /api/tax/countries/[countryRef]/rates/[rateId]/status — retire or
 *  restore one rate. Retiring a standard rate also clears its flag. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ countryRef: string; rateId: string }> }) {
  const { countryRef, rateId } = await params
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/tax/countries/${countryRef}/rates/${rateId}/status`, {
      method : "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(await req.json()),
    })

    const data = await res.json()
    if (res.ok) revalidateTag("tax-country", {})

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[tax-country-rate-status]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
