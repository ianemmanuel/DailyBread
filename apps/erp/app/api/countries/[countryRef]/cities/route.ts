import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * GET /api/countries/[countryRef]/cities — the client-side city picker, used by
 * ScopeSelector and by the marketing promotion form.
 *
 * The caller's query string is FORWARDED. It used not to be, and the effect was
 * silent: the backend defaults to pageSize=10, so every city picker in the app
 * offered the first ten cities of a country alphabetically and simply had no
 * row for the eleventh. Nothing errored — the city just wasn't there.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ countryRef: string }> },
) {
  try {
    const { countryRef } = await params
    const { getToken } = await auth()
    const token = await getToken()

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/countries/${countryRef}/cities${req.nextUrl.search}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 300 },
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[country-cities-list]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}

/** POST /api/countries/[countryRef]/cities — create a city in this country */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ countryRef: string }> },
) {
  try {
    const { countryRef } = await params
    const { getToken } = await auth()
    const token = await getToken()

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.text()

    const res = await fetch(`${BACKEND}/admin/v1/countries/${countryRef}/cities`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    })

    const data = await res.json()

    if (res.ok) {
      revalidateTag(`cities-${countryRef}`, {})
      revalidateTag(`country-${countryRef}`, {})
    }

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[country-cities-create]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
