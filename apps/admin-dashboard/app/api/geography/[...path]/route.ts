// app/api/geography/[...path]/route.ts

import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.BACKEND_API_URL!

export async function GET(
  req    : NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, context, "GET")
}

export async function POST(
  req    : NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, context, "POST")
}

export async function PATCH(
  req    : NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, context, "PATCH")
}

export async function DELETE(
  req    : NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, context, "DELETE")
}

async function proxy(
  req    : NextRequest,
  context: { params: Promise<{ path: string[] }> },
  method : string,
) {
  try {
    const { getToken } = await auth()
    const token = await getToken()

    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { path } = await context.params
    const pathStr   = path.join("/")
    const search    = req.nextUrl.search  // preserve query string

    const backendUrl = `${BACKEND_URL}/admin/v1/geography/${pathStr}${search}`

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }

    const body = method !== "GET" && method !== "DELETE"
      ? await req.text()
      : undefined

    const res = await fetch(backendUrl, { method, headers, body })
    const data = await res.json()

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[geography proxy]", err)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}