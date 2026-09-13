import { prisma } from "@repo/db"
import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"
import type { CustomerAccount, CustomerSessionData } from "@repo/types/backend"
import { listAddresses } from "./customer.address.service"

/*
 * The customer's own account.
 *
 * Thin on purpose. Identity lives in Clerk and arrives through the signup
 * webhook, so almost nothing here is writable: name and phone are, because a
 * customer changes those in Clerk and the webhook mirrors them, and email is
 * not, because it is the account's unique key and changing it belongs to Clerk
 * alone.
 */

/**
 * Everything the customer app needs on load: who they are, their address book,
 * and which address discovery should anchor on.
 *
 * One call rather than three. The address book is genuinely part of the session
 * for this app in a way it never was for the vendor dashboard — without an
 * address there is nothing to show — so it is fetched here rather than being
 * left to a second round trip before the first screen can render.
 */
export async function getCustomerSession(customer: CustomerAccount): Promise<CustomerSessionData> {
  const addresses = await listAddresses(customer.id)

  return {
    customer,
    addresses,
    defaultAddressId: addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? null,
  }
}

export interface UpdateCustomerProfileInput {
  fullName?: string | null
  phone?   : string | null
}

/**
 * The two fields a customer may change here.
 *
 * Email is deliberately absent: it is the unique key on the account and Clerk
 * owns it, so changing it is a Clerk flow that arrives back through
 * user.updated. Accepting it here would give one fact two owners.
 *
 * Destructured field by field rather than spread, the same rule every
 * controller in this codebase follows — a spread would let a client set status
 * or countryId.
 */
export async function updateCustomerProfile(
  customerId: string,
  input     : UpdateCustomerProfileInput,
): Promise<CustomerAccount> {
  const data: { fullName?: string | null; phone?: string | null } = {}

  if (input.fullName !== undefined) {
    data.fullName = optionalText(input.fullName, "Your name", 120)
  }
  if (input.phone !== undefined) {
    data.phone = optionalText(input.phone, "Your phone number", 32)
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError(HttpStatus.BAD_REQUEST, "Nothing to update.", "NO_CHANGES")
  }

  const updated = await prisma.consumerAccount.update({
    where : { id: customerId },
    select: { id: true, email: true, fullName: true, phone: true, countryId: true, status: true },
    data,
  })

  return updated as unknown as CustomerAccount
}

function optionalText(value: unknown, label: string, max: number): string | null {
  // An empty string is how a client clears a field, and it means null — storing
  // "" would make "has the customer told us?" unanswerable.
  if (value === null || value === "") return null
  if (typeof value !== "string") {
    throw new ApiError(HttpStatus.BAD_REQUEST, `${label} is not valid.`, "FIELD_INVALID")
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > max) {
    throw new ApiError(HttpStatus.BAD_REQUEST, `${label} is too long.`, "FIELD_TOO_LONG")
  }
  return trimmed
}
