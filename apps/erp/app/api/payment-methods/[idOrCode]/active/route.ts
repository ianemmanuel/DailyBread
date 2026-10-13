import { auth }          from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/** PATCH /api/payment-methods/[idOrCode]/active  Body: { isActive } */
export async function PATCH(
  req    : NextRequest,
  { params }: { params: Promise<{ idOrCode: string }> },
) {
  try {
    const { idOrCode } = await params
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const res = await fetch(`${BACKEND}/admin/v1/payment-methods/${idOrCode}/active`, {
      method : "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body   : JSON.stringify(body),
    })
    const data = await res.json()
    if (res.ok) revalidateTag("payment-methods", {})
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[payment-method-active]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
