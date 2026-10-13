import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

// Client action → backend sub-path. "photo-presign"/"photos" are flattened to
// one segment here so they don't collide with the [action] dynamic segment.
const ACTION_PATH: Record<string, string> = {
  start        : "start",
  record       : "record",
  cancel       : "cancel",
  "photo-presign": "photos/presign",
  photos       : "photos",
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ inspectionId: string; action: string }> },
) {
  try {
    const { inspectionId, action } = await params
    const sub = ACTION_PATH[action]
    if (!sub) return NextResponse.json({ message: "Invalid action" }, { status: 400 })

    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.text()
    const res = await fetch(`${BACKEND}/admin/v1/vendors/outlet-inspections/${inspectionId}/${sub}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body || "{}",
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      const outletId = new URL(req.url).searchParams.get("outletId")
      if (outletId) revalidateTag(`outlet-${outletId}`, {})
      revalidateTag("outlet-inspections-admin", {})
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[admin-outlet-inspection-action]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
