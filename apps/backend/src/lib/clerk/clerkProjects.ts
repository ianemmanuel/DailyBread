import { env } from "@/env"

export type ClerkAppType = "customer" | "vendor" | "courier" | "admin"

/* Issuers arrive CANONICAL — env.ts strips any trailing slash at the boundary,
 * because an exact-string comparison against a token's `iss` makes one extra
 * character reject every token. See `canonicalIssuer`. */

export function getClerkProjects(): Record<ClerkAppType, {
  issuer: string
  jwksUrl: string
}> {
  return {
    customer: {
      issuer : env.CLERK_CUSTOMER_ISSUER,
      jwksUrl: env.CLERK_CUSTOMER_JWKS_URL,
    },
    vendor: {
      issuer : env.CLERK_VENDOR_ISSUER,
      jwksUrl: env.CLERK_VENDOR_JWKS_URL,
    },
    courier: {
      issuer : env.CLERK_COURIER_ISSUER,
      jwksUrl: env.CLERK_COURIER_JWKS_URL,
    },
    admin: {
      issuer : env.CLERK_ADMIN_ISSUER,
      jwksUrl: env.CLERK_ADMIN_JWKS_URL,
    },
  }
}