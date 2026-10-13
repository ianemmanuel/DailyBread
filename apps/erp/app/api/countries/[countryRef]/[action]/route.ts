import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/**
 * POST /api/countries/[countryRef]/[action]
 * Actions: activate | deactivate | ready-for-vendors | not-ready-for-vendors
 *          | ready-for-customers | not-ready-for-customers
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ countryRef: string; action: string }> },
) {
  try {
    const { countryRef, action } = await params
    const { getToken } = await auth()
    const token = await getToken()

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const allowedActions = [
      "activate", "deactivate",
      "ready-for-vendors", "not-ready-for-vendors",
      "ready-for-customers", "not-ready-for-customers",
      "inspection-policy",
    ]
    if (!allowedActions.includes(action)) {
      return NextResponse.json({ message: "Invalid action" }, { status: 400 })
    }

    const body = await req.text()
    const res = await fetch(
      `${BACKEND}/admin/v1/countries/${countryRef}/${action}`,
      {
        method: "PATCH",
        headers: body
          ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
          : { Authorization: `Bearer ${token}` },
        body: body || undefined,
      },
    )

    const data = await res.json()

    if (res.ok) {
      revalidateTag(`country-${countryRef}`, {})
      revalidateTag("countries", {})
    }

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[country-action]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
