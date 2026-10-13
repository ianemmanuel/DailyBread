import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/vendors/action-reasons?appliesTo=vendor_application.rejected
 *
 * Proxies to the backend's action-reasons list, used to populate the
 * mandatory reasonCode dropdown on reject / needs-revision. Read access
 * reuses VENDORS_APPLICATIONS_REVIEW on the backend — no separate
 * permission for this lookup.
 */
export async function GET(req: NextRequest) {
  try {
    const { getToken } = await auth()
    const token = await getToken()

    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const appliesTo = req.nextUrl.searchParams.get("appliesTo")
    const params = new URLSearchParams({ activeOnly: "true" })
    if (appliesTo) params.set("appliesTo", appliesTo)
    const qs = `?${params.toString()}`

    const res = await fetch(
      `${process.env.BACKEND_API_URL}/admin/v1/action-reasons${qs}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[action-reasons]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
