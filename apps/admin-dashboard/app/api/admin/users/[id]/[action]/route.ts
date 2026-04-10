import { auth }     from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * Route handlers for user lifecycle actions.
 * Used by UserActionsMenu (client component) to proxy requests to the backend.
 *
 * POST /api/admin/users/[id]/invite
 * POST /api/admin/users/[id]/suspend
 * POST /api/admin/users/[id]/reinstate
 * POST /api/admin/users/[id]/deactivate
 */
export async function POST(
  req    : NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await params
  const { getToken }   = await auth()
  const token          = await getToken()

  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const allowedActions = ["invite", "suspend", "reinstate", "deactivate"]
  if (!allowedActions.includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  }

  let body: string | undefined
  try {
    const json = await req.json()
    body = JSON.stringify(json)
  } catch {
    // No body — fine for invite/reinstate
  }

  const res = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/users/${id}/${action}`,
    {
      method : "POST",
      headers: {
        Authorization : `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    },
  )

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}