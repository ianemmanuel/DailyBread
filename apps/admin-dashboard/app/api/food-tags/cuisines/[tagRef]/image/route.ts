import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/*
 * PUT    /api/food-tags/cuisines/:tagRef/image — publish or re-describe
 * DELETE /api/food-tags/cuisines/:tagRef/image — remove
 *
 * A proxy, so the Clerk token never reaches client JS. Every decision —
 * whether this admin may write global catalog content, whether the key is one
 * of ours — is the backend's.
 */
async function forward(req: NextRequest, tagRef: string, method: "PUT" | "DELETE") {
  const { getToken } = await auth()
  const token = await getToken()
  if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

  const res = await fetch(
    `${BACKEND}/admin/v1/food-tags/cuisines/${encodeURIComponent(tagRef)}/image`,
    {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(method === "PUT" ? { body: JSON.stringify(await req.json()) } : {}),
    },
  )

  return NextResponse.json(await res.json(), { status: res.status })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ tagRef: string }> }) {
  try {
    return await forward(req, (await params).tagRef, "PUT")
  } catch {
    return NextResponse.json({ message: "Could not update the image" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tagRef: string }> }) {
  try {
    return await forward(req, (await params).tagRef, "DELETE")
  } catch {
    return NextResponse.json({ message: "Could not remove the image" }, { status: 500 })
  }
}
