/*
 * Assertions for which rate-limit headers a backend call carries
 * (lib/api/forwarding-rule.ts). The backend side is tested in
 * apps/backend/src/config/rateLimit*.test.ts.
 *
 *   pnpm dlx tsx scripts/check-forwarding.ts
 */
import { CLIENT_IP_HEADER, INTERNAL_KEY_HEADER, forwardingFor } from "../lib/api/forwarding-rule"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.log(`  FAIL ${label}`, detail ?? "") }
}

const SECRET = "k".repeat(40)
let reads = 0
const ip = (value: string | null) => () => { reads++; return value }

{
  const h = forwardingFor({ secret: undefined, cached: false, authenticated: false, clientIp: ip("203.0.113.7") })
  check("no secret configured: nothing is sent", Object.keys(h).length === 0, h)
}
{
  reads = 0
  const h = forwardingFor({ secret: SECRET, cached: false, authenticated: true, clientIp: ip("203.0.113.7") })
  check("a signed-in call sends nothing — the backend keys it by verified user", Object.keys(h).length === 0, h)
  check("…and never even reads the client address", reads === 0)
}
{
  reads = 0
  const h = forwardingFor({ secret: SECRET, cached: true, authenticated: false, clientIp: ip("203.0.113.7") })
  check("an anonymous CACHED call sends the secret only (no per-visitor cache key)",
    h[INTERNAL_KEY_HEADER] === SECRET && !(CLIENT_IP_HEADER in h), h)
  check("…without reading the client address", reads === 0)
}
{
  const h = forwardingFor({ secret: SECRET, cached: false, authenticated: false, clientIp: ip(" 203.0.113.7 ") })
  check("an anonymous per-request call names the visitor",
    h[INTERNAL_KEY_HEADER] === SECRET && h[CLIENT_IP_HEADER] === "203.0.113.7", h)
}
for (const bad of [null, "", "203.0.113.7, 10.0.0.1", "unknown"]) {
  const h = forwardingFor({ secret: SECRET, cached: false, authenticated: false, clientIp: ip(bad) })
  check(`no single valid address (${JSON.stringify(bad)}): nothing, not the cache-fill budget`, Object.keys(h).length === 0, h)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
