import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  CLERK_CUSTOMER_ISSUER: z.string().url(),
  CLERK_CUSTOMER_JWKS_URL: z.string().url(),

  CLERK_VENDOR_ISSUER: z.string().url(),
  CLERK_VENDOR_JWKS_URL: z.string().url(),
  CLERK_VENDOR_SECRET_KEY: z.string().min(1),
  CLERK_VENDOR_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_VENDOR_WEBHOOK_SECRET: z.string().min(1),

  CLERK_COURIER_ISSUER: z.string().url(),
  CLERK_COURIER_JWKS_URL: z.string().url(),

  CLERK_ADMIN_ISSUER: z.string().url(),
  CLERK_ADMIN_JWKS_URL: z.string().url(),
  CLERK_ADMIN_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_ADMIN_SECRET_KEY: z.string().min(1),
  CLERK_ADMIN_WEBHOOK_SECRET: z.string().min(1),

  R2_ACCOUNT_ID: z.string().min(1),
  R2_ENDPOINT: z.string().url(),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_PUBLIC_BASE_URL: z.union([z.string().url(), z.literal("")]).default(""),
  R2_UPLOAD_EXPIRY_SECONDS: z.coerce.number().int().positive(),
  R2_VIEW_EXPIRY_SECONDS: z.coerce.number().int().positive(),

  //* Logging — required in production, optional in dev
  LOGTAIL_SOURCE_TOKEN: z.string().optional(),

  //* CORS — required in production, falls back to localhost in dev
  CORS_ORIGINS: z.string().optional(),

  AUDIT_DELETION_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

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

  if (parsed.data.NODE_ENV === "production" && !parsed.data.CORS_ORIGINS) {
    console.error("✗ CORS_ORIGINS is required when NODE_ENV=production")
    process.exit(1)
  }

  return parsed.data
}

export const env = loadEnv()
export type Env = typeof env