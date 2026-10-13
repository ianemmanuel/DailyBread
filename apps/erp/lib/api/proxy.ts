import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

/*
 * One proxy for the browser's calls to the backend (the Clerk token never
 * reaches client JS). Forwards the caller's QUERY STRING (an ERP proxy that
 * dropped it once truncated every city picker — see CLAUDE.md) and the body
 * as-is; the backend maps fields and decides everything.
 *
 * `expire` tags are EXPIRED, not merely marked stale ({ expire: 0 }): a
 * "default"-profile revalidate keeps serving the pre-write page (bug #18).
 */
export async function proxyToBackend(
  req        : NextRequest,
  backendPath: string,
  opts       : { expire?: string[]; label: string },
) {
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const method = req.method.toUpperCase()
    const body   = method === "GET" || method === "HEAD" ? undefined : (await req.text()) || "{}"
    const res = await fetch(`${BACKEND}${backendPath}${req.nextUrl.search}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
      cache  : "no-store",
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && method !== "GET") {
      for (const tag of opts.expire ?? []) revalidateTag(tag, { expire: 0 })
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error(`[${opts.label}]`, err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
