import type { Request } from "express"
import { verifyClerkJwt, type VerifiedClerkToken } from "./verifyClerkJwt"

/*
 * One verification per request.
 *
 * The rate limiter keys on a VERIFIED identity, so `identifyCaller` verifies
 * the bearer token before any module runs — and the module's own auth chain
 * (verifyVendorToken, verifyAdminToken, verifyCustomerToken…) then asks the
 * same question about the same token. This memoises the answer on the request
 * object, keyed by the token itself, so the second ask is free and both see
 * the identical outcome (success, or the identical error to classify and log).
 *
 * A WeakMap, so nothing outlives the request.
 */
const cache = new WeakMap<Request, { token: string; result: Promise<VerifiedClerkToken> }>()

export function verifyRequestToken(req: Request, token: string): Promise<VerifiedClerkToken> {
  const hit = cache.get(req)
  if (hit && hit.token === token) return hit.result

  const result = verifyClerkJwt(token)
  // A rejection is observed by whoever awaits it; this only stops an
  // unawaited copy being reported as unhandled.
  result.catch(() => {})
  cache.set(req, { token, result })
  return result
}
