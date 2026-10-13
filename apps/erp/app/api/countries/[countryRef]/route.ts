import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** GET /api/countries/[countryRef] — id or slug */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ countryRef: string }> },
) {
  try {
    const { countryRef } = await params
    const { getToken } = await auth()
    const token = await getToken()

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/countries/${countryRef}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 60 },
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[country-detail]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
