import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** PATCH /api/zones/[zoneId] — update a zone's name and/or boundary */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ zoneId: string }> },
) {
  return forward(req, params, "PATCH", "")
}

/** DELETE /api/zones/[zoneId] — permanently delete a zone (blocked if outlets assigned) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ zoneId: string }> },
) {
  return forward(req, params, "DELETE", "")
}

async function forward(
  req: NextRequest,
  params: Promise<{ zoneId: string }>,
  method: "PATCH" | "DELETE",
  suffix: string,
) {
  try {
    const { zoneId } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const cityRef = searchParams.get("cityRef")
    const body = method === "DELETE" ? undefined : await req.text()

    const res = await fetch(`${BACKEND}/admin/v1/zones/${zoneId}${suffix}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body || undefined,
    })
    const data = await res.json().catch(() => ({}))

    if (res.ok && cityRef) {
      revalidateTag(`city-${cityRef}`, {})
      revalidateTag(`city-${cityRef}-zones`, {})
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[zone-mutate]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
