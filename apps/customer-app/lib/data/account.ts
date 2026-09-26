import "server-only"
import type { CustomerSessionData } from "@repo/types/customer-app"

import { backendFetch, BackendApiError } from "@/lib/api/server"

/*
 * The signed-in customer: who they are and every address they hold.
 *
 * ── One read, not three ────────────────────────────────────────────────────
 *
 * `/auth/session` returns the account, the address book and which address is
 * the default in a single call, so the first authenticated screen renders
 * without a waterfall. It carries a token, so it is `no-store` — the app's
 * standing rule that a cached response must never depend on who asked.
 *
 * ── The states are the point ───────────────────────────────────────────────
 *
 * Two of them are specific to identity and both WILL happen:
 *
 *   PENDING   — the token is valid and the webhook has not landed yet. The
 *               backend answers 503 CUSTOMER_ACCOUNT_PENDING rather than 401
 *               precisely so this is distinguishable from "not signed in", and
 *               the honest response is "give it a second", not an error page.
 *   SUSPENDED — 403. The account exists and has been closed to them. Saying
 *               so plainly is better than a generic failure that reads like a
 *               bug and generates a support ticket.
 *
 * Everything else collapses into `error`, which is drawn as a failure and
 * never as an empty address book (recurring bug class #4).
 */

export type AccountState =
  | { kind: "ok"; session: CustomerSessionData }
  | { kind: "pending" }
  | { kind: "suspended"; message: string }
  | { kind: "error"; message: string }

export async function getAccount(): Promise<AccountState> {
  try {
    const session = await backendFetch<CustomerSessionData>("/api/customer/v1/auth/session")
    return { kind: "ok", session }
  } catch (err) {
    if (err instanceof BackendApiError) {
      if (err.code === "CUSTOMER_ACCOUNT_PENDING") return { kind: "pending" }
      if (err.code === "CUSTOMER_SUSPENDED" || err.code === "CUSTOMER_DELETED") {
        return { kind: "suspended", message: err.message }
      }
      return { kind: "error", message: err.message }
    }
    return { kind: "error", message: "We couldn't load your account just now." }
  }
}
