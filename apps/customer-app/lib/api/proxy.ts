import { NextResponse } from "next/server"
import { BackendApiError } from "./server"

/*
 * One shape for every /api/** route handler in this app, so the client always
 * receives the same envelope and status code whether the backend answered with
 * a structured error or something failed before we reached it.
 */
export async function proxyBackendCall<T>(fn: () => Promise<T>) {
  try {
    return NextResponse.json({ status: "success", data: await fn() })
  } catch (err) {
    if (err instanceof BackendApiError) {
      return NextResponse.json(
        { status: "error", message: err.message, code: err.code, errors: err.errors },
        { status: err.status },
      )
    }
    return NextResponse.json(
      { status: "error", message: "Something went wrong.", code: "UNKNOWN_ERROR" },
      { status: 500 },
    )
  }
}
