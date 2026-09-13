import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  //* Customer module — JWKS-verify for API auth, plus the Svix secret for the
  //* signup webhook. No backend Clerk client: nothing server-side ever creates
  //* or invites a customer, they self-register.
  //*
  //* The webhook secret is optional in dev and required in production, the same
  //* treatment CLERK_ADMIN_INVITE_REDIRECT_URL gets below — the backend has to
  //* keep booting for everyone working on another module while the Clerk
  //* customer application is still being wired up. processCustomerClerkWebhook
  //* throws a clear error if it is missing when a real event arrives, so an
  //* unset secret fails loudly at the one place it matters rather than silently
  //* accepting unverified payloads.
  CLERK_CUSTOMER_ISSUER: z.string().url(),
  CLERK_CUSTOMER_JWKS_URL: z.string().url(),
  CLERK_CUSTOMER_WEBHOOK_SECRET: z.string().min(1).optional(),

  //* Vendor module
  CLERK_VENDOR_ISSUER: z.string().url(),
  CLERK_VENDOR_JWKS_URL: z.string().url(),
  CLERK_VENDOR_SECRET_KEY: z.string().min(1),
  CLERK_VENDOR_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_VENDOR_WEBHOOK_SECRET: z.string().min(1),

  //* Courier module — JWKS-verify only, no backend client needed
  CLERK_COURIER_ISSUER: z.string().url(),
  CLERK_COURIER_JWKS_URL: z.string().url(),

  //* Admin module
  CLERK_ADMIN_ISSUER: z.string().url(),
  CLERK_ADMIN_JWKS_URL: z.string().url(),
  CLERK_ADMIN_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_ADMIN_SECRET_KEY: z.string().min(1),
  CLERK_ADMIN_WEBHOOK_SECRET: z.string().min(1),
  // Only consumed by admin.user.service.ts's sendAdminInvitation — an
  // admin-only feature unrelated to vendor/customer/courier startup.
  // Required in production (checked below), optional in dev so working
  // on another module doesn't require every module's env to be complete.
  CLERK_ADMIN_INVITE_REDIRECT_URL: z.string().url().optional(),

  //* Object storage (Cloudflare R2)
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ENDPOINT: z.string().url(),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  // Empty string is valid here — it means "private bucket, no public base URL"
  R2_PUBLIC_BASE_URL: z.union([z.string().url(), z.literal("")]).default(""),
  R2_UPLOAD_EXPIRY_SECONDS: z.coerce.number().int().positive(),
  R2_VIEW_EXPIRY_SECONDS: z.coerce.number().int().positive(),

  //* Logging — required in production, optional in dev (checked below)
  LOGTAIL_SOURCE_TOKEN: z.string().optional(),

  //* CORS — required in production, falls back to localhost in dev (checked below)
  CORS_ORIGINS: z.string().optional(),

  // Audit deletion safety flag
  AUDIT_DELETION_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  //* Database
  DATABASE_URL: z.string().url(),

  //* Field-level encryption for sensitive payout identifiers (bank account
  //* numbers, IBANs, mobile-money numbers). AES-256-GCM at rest + a keyed
  //* HMAC blind index for duplicate detection. Both are base64-encoded
  //* 32-byte keys. Deliberately optional in dev — field-encryption.ts falls
  //* back to a fixed, clearly-insecure dev key with a logged warning, same
  //* "works without the real thing configured" convention as SMTP. Required
  //* in production (checked below).
  PAYOUT_ENCRYPTION_KEY: z.string().optional(),
  PAYOUT_BLIND_INDEX_KEY: z.string().optional(),

  //* Transactional email (compliance notices, etc.) — deliberately optional.
  //* If SMTP_HOST is unset, sendEmail (lib/email/mailer.ts) logs the
  //* rendered email and no-ops instead of throwing, so local dev/CI never
  //* needs real credentials — same "works without the real thing configured
  //* yet" pattern this codebase already uses for mock revenue figures.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().default("no-reply@dailybread.app"),
  SUPPORT_EMAIL: z.string().email().default("support@dailybread.app"),
  // Used only to build a CTA link in vendor-facing emails — not read by
  // any live redirect logic. Optional since vendor-dashboard isn't part
  // of this pass; falls back to a plain-text mention if unset.
  VENDOR_DASHBOARD_URL: z.string().url().optional(),
  // Same idea for admin-facing emails (zone-change alerts link to the
  // city geography page). Optional — the email omits the CTA if unset.
  ADMIN_DASHBOARD_URL: z.string().url().optional(),
})

function loadEnv() {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n")

    // Logger isn't safe to use yet — it may depend on validated env
    // (e.g. LOGTAIL_SOURCE_TOKEN). console.error is the right tool here.
    console.error(`✗ Invalid environment configuration:\n${issues}`)
    process.exit(1)
  }

  if (parsed.data.NODE_ENV === "production" && !parsed.data.LOGTAIL_SOURCE_TOKEN) {
    console.error("✗ LOGTAIL_SOURCE_TOKEN is required when NODE_ENV=production")
    process.exit(1)
  }

  if (parsed.data.NODE_ENV === "production" && !parsed.data.CORS_ORIGINS) {
    console.error("✗ CORS_ORIGINS is required when NODE_ENV=production")
    process.exit(1)
  }

  if (parsed.data.NODE_ENV === "production" && !parsed.data.CLERK_ADMIN_INVITE_REDIRECT_URL) {
    console.error("✗ CLERK_ADMIN_INVITE_REDIRECT_URL is required when NODE_ENV=production")
    process.exit(1)
  }

  // In production an unset customer webhook secret means every customer signup
  // silently fails to reach the database — a worse failure than not booting.
  if (parsed.data.NODE_ENV === "production" && !parsed.data.CLERK_CUSTOMER_WEBHOOK_SECRET) {
    console.error("✗ CLERK_CUSTOMER_WEBHOOK_SECRET is required when NODE_ENV=production")
    process.exit(1)
  }

  if (parsed.data.NODE_ENV === "production" && (!parsed.data.PAYOUT_ENCRYPTION_KEY || !parsed.data.PAYOUT_BLIND_INDEX_KEY)) {
    console.error("✗ PAYOUT_ENCRYPTION_KEY and PAYOUT_BLIND_INDEX_KEY are required when NODE_ENV=production")
    process.exit(1)
  }

  return parsed.data
}

export const env = loadEnv()
export type Env = typeof env