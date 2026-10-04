import { isIP } from "node:net"

/*
 * Which rate-limit headers one backend call carries — the pure half of
 * lib/api/forwarding.ts, checked by scripts/check-forwarding.ts.
 *
 *   no secret configured        → nothing (the backend keys by address)
 *   signed in (has a token)     → nothing (the backend keys by verified user)
 *   anonymous + cached          → the secret only (this server's cache fills;
 *                                 a client header would split the cache)
 *   anonymous + per-request     → secret + the visitor's address, or NOTHING
 *                                 when no single valid address is known
 */
export const INTERNAL_KEY_HEADER = "x-db-internal-key"
export const CLIENT_IP_HEADER    = "x-db-client-ip"

export function forwardingFor(input: {
  secret       : string | undefined
  cached       : boolean
  authenticated: boolean
  /** The edge-reported address, raw; only read for anonymous per-request calls. */
  clientIp     : () => string | null
}): Record<string, string> {
  if (!input.secret || input.authenticated) return {}
  if (input.cached) return { [INTERNAL_KEY_HEADER]: input.secret }
  const ip = input.clientIp()?.trim()
  // Exactly one address. A list means the header is APPENDED to upstream, so
  // part of it is the visitor's own words.
  return ip && isIP(ip) ? { [INTERNAL_KEY_HEADER]: input.secret, [CLIENT_IP_HEADER]: ip } : {}
}
