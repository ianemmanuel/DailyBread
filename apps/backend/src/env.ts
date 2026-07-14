import "dotenv/config"
import { z } from "zod"

//* Captured as early as possible so startup timing reflects the true
//* process start, not just the point bootstrap() happens to run.
export const processStartedAt = Date.now()

//* This file is the "load env" + "validate env" stages combined.
//* Node guarantees this module fully executes before anything that
//* imports it (directly or transitively) runs — so as long as
//* `index.ts` imports "./env" first, nothing downstream (logger,
//* Prisma, services) can start on a bad config.

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Customer module — JWKS-verify only, no backend client needed
  CLERK_CUSTOMER_ISSUER: z.string().url(),
  CLERK_CUSTOMER_JWKS_URL: z.string().url(),

  // Vendor module
  CLERK_VENDOR_ISSUER: z.string().url(),
  CLERK_VENDOR_JWKS_URL: z.string().url(),
  CLERK_VENDOR_SECRET_KEY: z.string().min(1),
  CLERK_VENDOR_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_VENDOR_WEBHOOK_SECRET: z.string().min(1),

  // Courier module — JWKS-verify only, no backend client needed
  CLERK_COURIER_ISSUER: z.string().url(),
  CLERK_COURIER_JWKS_URL: z.string().url(),

  // Admin module
  CLERK_ADMIN_ISSUER: z.string().url(),
  CLERK_ADMIN_JWKS_URL: z.string().url(),
  CLERK_ADMIN_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_ADMIN_SECRET_KEY: z.string().min(1),
  CLERK_ADMIN_WEBHOOK_SECRET: z.string().min(1),

  // Object storage (Cloudflare R2)
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ENDPOINT: z.string().url(),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  // Empty string is valid here — it means "private bucket, no public base URL"
  R2_PUBLIC_BASE_URL: z.union([z.string().url(), z.literal("")]).default(""),
  R2_UPLOAD_EXPIRY_SECONDS: z.coerce.number().int().positive(),
  R2_VIEW_EXPIRY_SECONDS: z.coerce.number().int().positive(),

  // Logging — required in production, optional in dev (checked below)
  LOGTAIL_SOURCE_TOKEN: z.string().optional(),

  // Audit deletion safety flag
  AUDIT_DELETION_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Database
  DATABASE_URL: z.string().url(),
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

  return parsed.data
}

export const env = loadEnv()
export type Env = typeof env