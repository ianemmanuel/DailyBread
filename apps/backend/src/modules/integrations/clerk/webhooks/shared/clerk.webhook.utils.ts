import { Webhook } from "svix"
import { Request }  from "express"

// ─── Clerk payload types ──────────────────────────────────────────────────────

export interface ClerkEmailAddress {
  id            : string
  email_address : string
}

export interface ClerkUserCreatedData {
  id                        : string
  primary_email_address_id  : string
  email_addresses           : ClerkEmailAddress[]
  first_name                : string | null
  last_name                 : string | null
}

export interface ClerkUserDeletedData {
  id      : string
  deleted : boolean
}

export interface ClerkWebhookEvent {
  type : string
  data : ClerkUserCreatedData & ClerkUserDeletedData
}

// ─── Supported event types ────────────────────────────────────────────────────

export const WEBHOOK_EVENTS = {
  USER_CREATED : "user.created",
  USER_UPDATED : "user.updated",
  USER_DELETED : "user.deleted",
} as const

// ─── Verification ─────────────────────────────────────────────────────────────

/**
 * Verifies a raw Svix webhook request against a known secret.
 * Throws if verification fails — caller must catch.
 */
export function verifyWebhookRequest(req: Request, secret: string): ClerkWebhookEvent {
  const rawBody = req.body as Buffer

  if (!Buffer.isBuffer(rawBody)) {
    throw new Error(
      "Request body is not a Buffer. Ensure express.raw({ type: 'application/json' }) " +
      "is applied BEFORE express.json() for this route."
    )
  }

  const wh = new Webhook(secret)
  return wh.verify(rawBody.toString("utf8"), req.headers as Record<string, string>) as ClerkWebhookEvent
}

/**
 * Extracts the primary email from a Clerk user.created payload.
 * Uses primary_email_address_id to find the correct entry —
 * index 0 is NOT guaranteed to be the primary address.
 */
export function extractPrimaryEmail(data: ClerkUserCreatedData): string | null {
  const primary = data.email_addresses.find(
    (e) => e.id === data.primary_email_address_id
  )
  return primary?.email_address ?? null
}

/**
 * Normalizes an email for safe storage and comparison.
 * Prevents case-mismatch issues (John@Acme.com vs john@acme.com).
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}