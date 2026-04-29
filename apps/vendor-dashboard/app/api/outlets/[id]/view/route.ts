import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

type Params = { params: Promise<{ id: string }> }

//* GET /api/outlets/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params

  const { getToken } = await auth()
  
  const token = await getToken()
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const res = await fetch(`${BACKEND}/vendor/v1/outlets/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      next   : { tags: [`vendor-outlet-${id}`] },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ status: "error", message: "Internal error" }, { status: 500 })
  }
}
