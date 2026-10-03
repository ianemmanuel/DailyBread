/*
 * Why a Clerk JWT was refused, in a shape that is safe to log.
 *
 * Every verifier answers a failed token with the same bare 401 "Unauthorized"
 * — deliberately, a caller learns nothing about why. That made one real
 * incident undiagnosable: a vendor saw "Unauthorized" right after creating a
 * meal, and the only trace was a debug line nobody reads. This classifies the
 * failure so the log says WHICH check refused it.
 *
 * Never logs the token or any identity claim. `secondsPastExp` comes from the
 * library's own `expiredAt`, not from decoding the payload; the issuer is never
 * echoed back (an untrusted one is attacker-controlled text).
 */

export type JwtFailureReason =
  | "expired"           // signature fine, `exp` in the past
  | "not_yet_valid"     // `nbf` in the future — a clock running SLOW
  | "untrusted_issuer"  // `iss` matches none of the configured Clerk apps
  | "malformed"         // not a JWT, or missing iss / sub / kid
  | "bad_signature"     // signature or issuer check failed
  | "signing_key"       // JWKS could not produce the key (rotated, unreachable, rate-limited)
  | "unknown"

export interface JwtFailure {
  reason        : JwtFailureReason
  errorName     : string
  /** Only for `expired`: how long ago, by THIS server's clock. Seconds, so a
   *  value of 1–5 points at the skew window and a value of hundreds at a stale
   *  session rather than a race. */
  secondsPastExp?: number
}

export function describeJwtFailure(err: unknown, now: Date = new Date()): JwtFailure {
  const error     = err instanceof Error ? err : null
  const errorName = error?.name ?? typeof err

  switch (errorName) {
    case "TokenExpiredError": {
      const expiredAt = (err as { expiredAt?: unknown }).expiredAt
      return {
        reason   : "expired",
        errorName,
        ...(expiredAt instanceof Date
          ? { secondsPastExp: Math.round((now.getTime() - expiredAt.getTime()) / 100) / 10 }
          : {}),
      }
    }
    case "NotBeforeError":
      return { reason: "not_yet_valid", errorName }
    case "JsonWebTokenError":
      return { reason: "bad_signature", errorName }
    case "SigningKeyNotFoundError":
    case "JwksError":
    case "JwksRateLimitError":
      return { reason: "signing_key", errorName }
  }

  // verifyClerkJwt's own pre-checks throw plain Errors; classify by their text.
  const message = error?.message ?? ""
  if (message.startsWith("Untrusted Clerk issuer")) return { reason: "untrusted_issuer", errorName }
  if (message.startsWith("Invalid JWT"))           return { reason: "malformed", errorName }

  return { reason: "unknown", errorName }
}
