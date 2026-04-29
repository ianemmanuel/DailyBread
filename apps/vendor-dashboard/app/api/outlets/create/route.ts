import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"


//* POST /api/outlets/create
const BACKEND = process.env.BACKEND_API_URL

export async function POST(req: NextRequest) {
  const { getToken } = await auth()

  const token = await getToken()
  
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await req.json()
    const res = await fetch(`${BACKEND}/vendor/v1/outlets`, {
      method : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(body),
    })
    const data = await res.json()
    if (res.ok) revalidateTag("vendor-outlets","default")
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ status: "error", message: "Internal error" }, { status: 500 })
  }
}