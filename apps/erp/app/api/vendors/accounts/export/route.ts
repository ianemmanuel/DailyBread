import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** GET /api/vendors/accounts/export?... (same filters as /vendors/accounts) */
export async function GET(req: NextRequest) {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const res = await fetch(`${BACKEND}/admin/v1/vendors/accounts/export?${req.nextUrl.searchParams}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: "Export failed" }))
      return NextResponse.json(data, { status: res.status })
    }

    const csv = await res.text()
    return new NextResponse(csv, {
      status : 200,
      headers: {
        "Content-Type"       : "text/csv; charset=utf-8",
        "Content-Disposition": res.headers.get("content-disposition") ?? "attachment; filename=\"vendor-accounts.csv\"",
      },
    })
  } catch (err) {
    console.error("[vendor-accounts-export]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
