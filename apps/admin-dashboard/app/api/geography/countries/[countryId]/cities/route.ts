import { auth }     from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

// GET /api/admin/geography/countries/[countryId]/cities
export async function GET(
  _req   : NextRequest,
  { params }: { params: Promise<{ countryId: string }> },
) {
  try {
    const { countryId } = await params
    const { getToken }  = await auth()
    const token         = await getToken()

    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const res  = await fetch(
      `${BACKEND}/admin/v1/geography/countries/${countryId}/cities`,
      {
        headers: { Authorization: `Bearer ${token}` },
        next   : { revalidate: 3600 },
      },
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}