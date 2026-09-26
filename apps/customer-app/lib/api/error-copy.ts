import { ClientApiError } from "@/lib/api/client"

/*
 * Turning an error CODE into something a customer can act on.
 *
 * ── Why a map and not the server's message ─────────────────────────────────
 *
 * Backend messages are written for the API — accurate, and occasionally
 * useless to the person reading them. "Unauthorized" is the worst of them:
 * from the customer's side nothing about their session is unauthorised, they
 * pressed Save and the app said no. Codes are stable and messages are not, so
 * the code decides the copy and the message is the fallback.
 *
 * This is the storefront's half of the same split the backend already makes
 * with `SERVICEABILITY_COPY` and `VendorGoLiveBlocker`: one code, one meaning,
 * and the wording can change without touching a service.
 *
 * Anything unmapped falls through to the server's own message, so a new code
 * still says SOMETHING true rather than being swallowed by a generic apology.
 */

const COPY: Record<string, string> = {
  // ── Identity ─────────────────────────────────────────────────────────────
  MISSING_TOKEN: "Please sign in to save this address — it only takes a moment.",
  INVALID_TOKEN: "Your session has expired. Sign in again and we'll pick up where you left off.",
  AUTH_REQUIRED: "Please sign in to continue.",
  CUSTOMER_ACCOUNT_PENDING:
    "We're still setting up your account — try again in a second.",
  CUSTOMER_SUSPENDED: "This account is suspended, so it can't save addresses right now.",

  // ── The address itself ───────────────────────────────────────────────────
  TOO_MANY_ADDRESSES:
    "You've saved as many addresses as we can keep. Remove one you no longer use first.",
  OUTSIDE_COVERAGE:
    "We don't deliver anywhere near that spot yet, so it can't be saved as an address.",
  LOCATION_REQUIRED: "Drop a pin on the map so we know exactly where to deliver.",
  INCOMPLETE_LOCATION: "That map location didn't come through. Move the pin and try again.",
  COUNTRY_MISMATCH: "That pin isn't in the country you chose. Move it, or pick the right country.",
  ADDRESS_NOT_FOUND: "We couldn't find that address — it may have been removed.",
  ADDRESS_NOT_PINNED: "That address has no map location yet. Open it and drop a pin.",

  // ── Infrastructure ───────────────────────────────────────────────────────
  BACKEND_URL_MISSING: "We can't reach DailyBread right now. Please try again shortly.",
  UNKNOWN_ERROR: "Something went wrong on our side. Please try again.",
}

/**
 * The sentence to show a customer for a failed request.
 *
 * `fallback` covers a thrown value that is not an API error at all — a dropped
 * connection, usually — where there is no code and no server message to use.
 */
export function customerErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (err instanceof ClientApiError) {
    return COPY[err.code] ?? err.message ?? fallback
  }
  /* A network failure never reached the server, so it has no code — say that
   * rather than blaming the request. */
  if (err instanceof TypeError) {
    return "We couldn't reach DailyBread. Check your connection and try again."
  }
  return fallback
}
