import { describe, expect, it } from "vitest"
import { generateKeyPairSync } from "node:crypto"
import jwt from "jsonwebtoken"
import { verifyWithKey } from "./verifyClerkJwt"
import { describeJwtFailure } from "./describeJwtFailure"

/*
 * Clerk's manual-verification checklist against a locally generated key —
 * the same checks verifyClerkJwt applies after fetching the instance's key.
 */

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength      : 2048,
  publicKeyEncoding  : { type: "spki", format: "pem" },
  privateKeyEncoding : { type: "pkcs8", format: "pem" },
})

const ISSUER = "https://vendor.clerk.test"
const ORIGIN = "https://vendors.dailybread.test"
const now = () => Math.floor(Date.now() / 1000)

const sign = (claims: Record<string, unknown>, options: jwt.SignOptions = {}) =>
  jwt.sign({ sub: "user_1", iss: ISSUER, iat: now(), exp: now() + 60, ...claims }, privateKey, {
    algorithm: "RS256", keyid: "k1", ...options,
  })

const verify = (token: string, authorizedParties: string[] = [ORIGIN]) =>
  verifyWithKey(token, publicKey, { issuer: ISSUER, authorizedParties })

describe("verifyWithKey (Clerk's manual-verification checklist)", () => {
  it("accepts a well-formed RS256 token from an authorized party", () => {
    expect(verify(sign({ azp: ORIGIN })).sub).toBe("user_1")
  })

  it("refuses an `azp` that is not one of our origins", () => {
    expect(() => verify(sign({ azp: "https://evil.test" }))).toThrow("Unauthorized party")
    try { verify(sign({ azp: "https://evil.test" })) } catch (err) {
      expect(describeJwtFailure(err).reason).toBe("unauthorized_party")
    }
  })

  it("passes a token with no `azp`, as Clerk documents, and skips the check when none are configured", () => {
    expect(verify(sign({})).sub).toBe("user_1")
    expect(verify(sign({ azp: "https://anything.test" }), []).sub).toBe("user_1")
  })

  it("refuses an expired token and a not-yet-valid one", () => {
    expect(() => verify(sign({ exp: now() - 10 }))).toThrow(jwt.TokenExpiredError)
    expect(() => verify(sign({ nbf: now() + 600 }))).toThrow(jwt.NotBeforeError)
  })

  it("refuses another issuer", () => {
    expect(() => verify(sign({ iss: "https://customer.clerk.test" }))).toThrow(jwt.JsonWebTokenError)
  })

  it("pins RS256: an HS256 token keyed with the PUBLIC key (algorithm confusion) is refused", () => {
    const forged = jwt.sign({ sub: "attacker", iss: ISSUER, exp: now() + 60 }, "not-the-private-key", { algorithm: "HS256" })
    expect(() => verify(forged)).toThrow(jwt.JsonWebTokenError)
  })

  it("refuses a token signed by a different key", () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey
    const token = jwt.sign({ sub: "user_1", iss: ISSUER, exp: now() + 60 }, other, { algorithm: "RS256" })
    expect(() => verify(token)).toThrow(jwt.JsonWebTokenError)
  })
})
