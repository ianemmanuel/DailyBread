import { describe, it, expect } from "vitest"
import jwt from "jsonwebtoken"
import { describeJwtFailure } from "./describeJwtFailure"

const SECRET = "test-secret"
const NOW_S  = 1_800_000_000

function verifyError(token: string, nowSeconds = NOW_S): unknown {
  try {
    jwt.verify(token, SECRET, { clockTimestamp: nowSeconds })
  } catch (err) {
    return err
  }
  throw new Error("expected verification to fail")
}

describe("describeJwtFailure", () => {
  /*
   * The case the incident hinges on: Clerk's middleware accepts a session token
   * up to 5 s past `exp`, and `jwt.verify` with no tolerance refuses it. The
   * log must say "expired" and by how much, or the two cannot be told apart
   * from any other 401.
   */
  it("reports an expired token and how far past exp it is", () => {
    const token = jwt.sign({ sub: "user_x", exp: NOW_S - 3 }, SECRET)
    const err = verifyError(token)
    const failure = describeJwtFailure(err, new Date(NOW_S * 1000))
    expect(failure).toEqual({ reason: "expired", errorName: "TokenExpiredError", secondsPastExp: 3 })
  })

  it("reports a bad signature separately from expiry", () => {
    const token = jwt.sign({ sub: "user_x", exp: NOW_S + 60 }, "another-secret")
    expect(describeJwtFailure(verifyError(token)).reason).toBe("bad_signature")
  })

  it("reports a not-yet-valid token (a slow clock)", () => {
    const token = jwt.sign({ sub: "user_x", nbf: NOW_S + 30, exp: NOW_S + 90 }, SECRET)
    expect(describeJwtFailure(verifyError(token)).reason).toBe("not_yet_valid")
  })

  it("classifies verifyClerkJwt's own pre-check errors", () => {
    expect(describeJwtFailure(new Error("Untrusted Clerk issuer: https://evil.example")).reason)
      .toBe("untrusted_issuer")
    expect(describeJwtFailure(new Error("Invalid JWT structure")).reason).toBe("malformed")
  })

  it("classifies JWKS failures as a signing-key problem", () => {
    const err = Object.assign(new Error("no key"), { name: "SigningKeyNotFoundError" })
    expect(describeJwtFailure(err).reason).toBe("signing_key")
  })

  // The log line is only safe if nothing from the token can reach it.
  it("never carries the issuer text or any claim into the result", () => {
    const failure = describeJwtFailure(new Error("Untrusted Clerk issuer: https://evil.example/?x=user_secret"))
    expect(JSON.stringify(failure)).not.toContain("evil")
    expect(JSON.stringify(failure)).not.toContain("user_")
  })

  it("does not throw on a non-Error", () => {
    expect(describeJwtFailure("nope")).toEqual({ reason: "unknown", errorName: "string" })
  })
})
