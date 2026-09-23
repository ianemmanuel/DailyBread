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
    return envelopeError(err)
  }
}

/** The error half on its own, for a handler that does more than forward one
 *  call — setting a cookie, say — and so cannot use proxyBackendCall. */
export function envelopeError(err: unknown) {
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

/** A refusal decided HERE, before the backend was asked. */
export function envelopeReject(status: number, code: string, message: string) {
  return NextResponse.json({ status: "error", message, code }, { status })
}
