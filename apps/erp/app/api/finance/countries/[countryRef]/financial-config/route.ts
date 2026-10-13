import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

type P = { params: Promise<{ countryRef: string }> }

/** GET the country financial-config view; POST creates (get-or-create) the DRAFT config. */
export async function GET(_req: NextRequest, { params }: P) {
  try {
    const { countryRef } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/finance/countries/${countryRef}/financial-config`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch (err) {
    console.error("[finance-country-config-get]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}

export async function POST(_req: NextRequest, { params }: P) {
  try {
    const { countryRef } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/finance/countries/${countryRef}/financial-config`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (res.ok) revalidateTag(`finance-country-config-${countryRef}`, {})
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[finance-country-config-create]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
