import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

//* GET /api/outlets

export async function GET() {
  const { getToken } = await auth()

  const token = await getToken()

  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const res = await fetch(`${BACKEND}/vendor/v1/outlets/`, {
      headers: { Authorization: `Bearer ${token}` },
      next   : { tags: ["vendor-outlets"] },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ status: "error", message: "Internal error" }, { status: 500 })
  }
}

