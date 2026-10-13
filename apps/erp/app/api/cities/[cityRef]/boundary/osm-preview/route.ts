import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * GET /api/cities/[cityRef]/boundary/osm-preview?q=&countryCode=
 * Proxies the backend OSM/Nominatim boundary lookup — preview only, no write.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cityRef: string }> },
) {
  try {
    const { cityRef } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const qs = searchParams.toString()

    const res = await fetch(
      `${BACKEND}/admin/v1/cities/${cityRef}/boundary/osm-preview${qs ? `?${qs}` : ""}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[city-boundary-osm-preview]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
