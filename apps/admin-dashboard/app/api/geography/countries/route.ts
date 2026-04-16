import { auth }     from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

async function getAuthToken() {
  const { getToken } = await auth()
  return getToken()
}

// GET /api/admin/geography/countries
export async function GET(_req: NextRequest) {
  try {
    const token = await getAuthToken()
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const res  = await fetch(`${BACKEND}/admin/v1/geography/countries`, {
      headers: { Authorization: `Bearer ${token}` },
      next   : { revalidate: 3600 },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}