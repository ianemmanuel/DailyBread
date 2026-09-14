/*
 * Client-side fetch. Always calls this app's own /api/** route handlers, never
 * the backend directly — the Clerk token is attached server-side inside those
 * handlers, so it never has to exist in client JS at all.
 */
export class ClientApiError extends Error {
  code   : string
  status : number
  errors?: { field?: string; message: string }[]

  constructor(status: number, message: string, code: string, errors?: { field?: string; message: string }[]) {
    super(message)
    this.name = "ClientApiError"
    this.status = status
    this.code = code
    this.errors = errors
  }
}

interface ApiEnvelope<T> {
  status  : "success" | "error"
  message?: string
  data?   : T
  code?   : string
  errors? : { field?: string; message: string }[]
}

export async function clientFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })

  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null

  if (!res.ok || body?.status === "error") {
    throw new ClientApiError(
      res.status,
      body?.message ?? "Something went wrong.",
      body?.code ?? "UNKNOWN_ERROR",
      body?.errors,
    )
  }

  return body?.data as T
}
