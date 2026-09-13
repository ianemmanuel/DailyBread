import { Webhook } from "svix"
import { Request }  from "express"

// ─── Clerk payload types ──────────────────────────────────────────────────────

export interface ClerkEmailAddress {
  id            : string
  email_address : string
  /** Present on real Clerk payloads; absent on some hand-fired test events, so
   *  it is optional and callers must treat "missing" as "unknown", never as
   *  "verified". */
  verification? : { status?: string | null } | null
}

export interface ClerkPhoneNumber {
  id           : string
  phone_number : string
}

export interface ClerkUserCreatedData {
  id                        : string
  primary_email_address_id  : string
  email_addresses           : ClerkEmailAddress[]
  first_name                : string | null
  last_name                 : string | null
  /** Optional because the vendor and admin apps do not collect a phone. The
   *  customer app does, and adding it here rather than in a second payload type
   *  keeps one description of what Clerk sends. */
  primary_phone_number_id?  : string | null
  phone_numbers?            : ClerkPhoneNumber[]
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
 * Uses primary_email_address_id to find the correct entry — index 0 is
 * NOT guaranteed to be the primary address. Falls back to the first
 * address on the account if the primary pointer doesn't resolve to one
 * (seen with some social-login signups) — better to sync with *an*
 * email than drop the vendor's signup entirely over a pointer mismatch.
 */
export function extractPrimaryEmail(data: ClerkUserCreatedData): string | null {
  if (!data.email_addresses?.length) return null

  const primary = data.email_addresses.find(
    (e) => e.id === data.primary_email_address_id
  )

  return primary?.email_address ?? data.email_addresses[0]?.email_address ?? null
}

/**
 * Normalizes an email for safe storage and comparison.
 * Prevents case-mismatch issues (John@Acme.com vs john@acme.com).
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}
/**
 * The primary phone, resolved the same way as the primary email — by the
 * pointer, never by index. Returns null when the user gave no phone, which is
 * the common case: Clerk only collects one if the sign-up flow asks for it.
 */
export function extractPrimaryPhone(data: ClerkUserCreatedData): string | null {
  const numbers = data.phone_numbers
  if (!numbers?.length) return null

  const primary = numbers.find((p) => p.id === data.primary_phone_number_id)
  return primary?.phone_number ?? numbers[0]?.phone_number ?? null
}

/**
 * A display name from Clerk's two name fields.
 *
 * Returns null rather than an empty string when neither is set — a customer who
 * signed up with only an email genuinely has no name yet, and storing "" would
 * make "has the customer told us their name?" unanswerable.
 */
export function extractFullName(data: ClerkUserCreatedData): string | null {
  const full = [data.first_name, data.last_name].filter(Boolean).join(" ").trim()
  return full.length > 0 ? full : null
}

/**
 * Whether Clerk considers the primary email proven.
 *
 * Only ever used to decide whether an inbound identity may ADOPT an existing
 * row that already holds this email address (see the customer webhook). An
 * absent verification block reads as NOT verified: the conservative answer is
 * the only safe one when the question is "may this person inherit that
 * account".
 */
export function isPrimaryEmailVerified(data: ClerkUserCreatedData): boolean {
  const primary = data.email_addresses?.find((e) => e.id === data.primary_email_address_id)
  return primary?.verification?.status === "verified"
}
