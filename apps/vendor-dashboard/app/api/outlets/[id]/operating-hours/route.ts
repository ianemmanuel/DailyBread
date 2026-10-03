import { auth } from "@clerk/nextjs/server"
import { expireTags } from "@/lib/cache/expire"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

type Params = { params: Promise<{ id: string }> }

//* PUT /api/outlets/[id]/operating-hours
export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params

  const { getToken } = await auth()
  const token = await getToken()
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await req.json()
    const res = await fetch(`${BACKEND}/vendor/v1/outlets/${id}/operating-hours`, {
      method : "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(body),
    })
    const data = await res.json()
    if (res.ok) expireTags(`vendor-outlet-${id}`)
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ status: "error", message: "Internal error" }, { status: 500 })
  }
}
