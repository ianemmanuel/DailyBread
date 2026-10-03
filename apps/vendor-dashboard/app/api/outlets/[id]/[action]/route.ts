import { auth } from "@clerk/nextjs/server"
import { expireTags } from "@/lib/cache/expire"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

type Params = { params: Promise<{ id: string; action: string }> }

//* POST /api/outlets/[id]/[action]
// Handles: deactivate | reactivate | close-temporarily | reopen | set-primary
export async function POST(req: NextRequest, { params }: Params) {
  const { id, action } = await params
  const { getToken } = await auth()
  const token = await getToken()
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ALLOWED_ACTIONS = ["deactivate", "reactivate", "close-temporarily", "reopen", "set-primary"]
  if (!ALLOWED_ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  }

  try {
    // close-temporarily sends a body with reopenAt; others send no body
    let body: string | undefined
    if (action === "close-temporarily") {
      const json = await req.json().catch(() => ({}))
      body = JSON.stringify(json)
    }

    const res = await fetch(`${BACKEND}/vendor/v1/outlets/${id}/${action}`, {
      method : "POST",
      headers: {
        Authorization : `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body } : {}),
    })
    const data = await res.json()
    if (res.ok) {
      expireTags("vendor-outlets")
      expireTags(`vendor-outlet-${id}`)
    }
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ status: "error", message: "Internal error" }, { status: 500 })
  }
}