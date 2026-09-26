import { describe, expect, it } from "vitest"

import { canonicalIssuer } from "./env"

/*
 * A trailing slash on an identity provider's issuer is not cosmetic: issuers
 * are compared to a token's `iss` claim by exact string, so one extra
 * character rejects every token from that instance.
 *
 * This is here because it happened. `CLERK_CUSTOMER_ISSUER` was configured as
 * `https://…clerk.accounts.dev/` while Clerk's own discovery document declares
 * it without the slash. Every authenticated customer request failed as
 * "Untrusted Clerk issuer" and surfaced in the browser as a bare
 * "Unauthorized" — and because webhooks are verified by Svix secret and never
 * touch the issuer, sign-up kept working and made the wiring look correct.
 */
describe("canonicalIssuer", () => {
  const CANONICAL = "https://desired-ox-3711.clerk.accounts.dev"

  it("leaves a canonical issuer untouched", () => {
    expect(canonicalIssuer(CANONICAL)).toBe(CANONICAL)
  })

  it("drops a trailing slash — the failure this exists to stop", () => {
    expect(canonicalIssuer(`${CANONICAL}/`)).toBe(CANONICAL)
  })

  it("drops several, because a paste can carry more than one", () => {
    expect(canonicalIssuer(`${CANONICAL}///`)).toBe(CANONICAL)
  })

  it("trims whitespace, which an .env line picks up easily", () => {
    expect(canonicalIssuer(`  ${CANONICAL}/  `)).toBe(CANONICAL)
  })

  it("keeps a PATH that is part of the issuer", () => {
    // Not Clerk's shape, but other providers issue from a path and the last
    // segment is meaningful — only trailing slashes go.
    expect(canonicalIssuer("https://auth.example.com/realms/dailybread/")).toBe(
      "https://auth.example.com/realms/dailybread",
    )
  })

  it("is idempotent", () => {
    expect(canonicalIssuer(canonicalIssuer(`${CANONICAL}/`))).toBe(CANONICAL)
  })
})
