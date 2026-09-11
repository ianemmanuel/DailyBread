import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/*
 * GET /api/cities/:cityId/placement?latitude=&longitude=
 *
 * What one candidate pin means. Called as the vendor moves the marker, so it
 * is never cached — a stale verdict is worse than no verdict. The backend
 * validates the coordinates and the city; this only forwards them.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ cityId: string }> }) {
  const { cityId } = await params
  const { getToken } = await auth()
  const token = await getToken()

  if (!token) return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 })

  const qs = new URLSearchParams({
    latitude : req.nextUrl.searchParams.get("latitude")  ?? "",
    longitude: req.nextUrl.searchParams.get("longitude") ?? "",
  })

  try {
    const res = await fetch(`${BACKEND}/vendor/v1/cities/${cityId}/placement?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache  : "no-store",
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ status: "error", message: "Internal error" }, { status: 500 })
  }
}
