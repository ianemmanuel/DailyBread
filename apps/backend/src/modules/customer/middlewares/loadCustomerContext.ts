import { Request, Response, NextFunction } from "express"
import { prisma, ConsumerStatus } from "@repo/db"
import type {
  AuthenticatedCustomerRequest,
  CustomerRequest,
  MaybeCustomerRequest,
  CustomerAccount,
} from "@repo/types/backend"
import type { ConsumerStatus as DomainConsumerStatus } from "@repo/types/enums"

import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"
import { logger } from "@/lib/pino/logger"
import { resolveOptionalCustomerToken } from "./verifyCustomerToken"

const authLog = logger.child({ module: "auth:customer" })

const ACCOUNT_SELECT = {
  id: true, email: true, fullName: true, phone: true,
  countryId: true, status: true, deletedAt: true, suspensionReason: true,
} as const

interface AccountRow {
  id       : string
  email    : string
  fullName : string | null
  phone    : string | null
  countryId: string | null
  status   : ConsumerStatus
  deletedAt: Date | null
  suspensionReason: string | null
}

/*
 * Prisma's generated enums and @repo/types' hand-declared ones are nominally
 * distinct even with identical values. Cast once, at this exact boundary, the
 * same way loadVendorContext does.
 */
function toDomain(row: AccountRow): CustomerAccount {
  return {
    id       : row.id,
    email    : row.email,
    fullName : row.fullName,
    phone    : row.phone,
    countryId: row.countryId,
    status   : row.status as unknown as DomainConsumerStatus,
  }
}

/*
 * STEP 2 (REQUIRED) — the customer's own account.
 *
 * One indexed read on clerkId. Deliberately does NOT load addresses: those are
 * a specific endpoint's concern, not universal request context, and paying for
 * them on every request would be the same mistake loadVendorContext avoids by
 * not loading outlet counts.
 *
 * A SUSPENDED customer is refused rather than let through carrying a flag.
 * There is no equivalent of the vendor's "a banned vendor still needs to see
 * that they are banned" case — a customer has no dashboard, and their account
 * page is not somewhere they need to reach while suspended.
 */
export async function loadCustomerContext(req: Request, _res: Response, next: NextFunction) {
  const { customerClerkUserId } = req as AuthenticatedCustomerRequest

  if (!customerClerkUserId) {
    return next(new ApiError(HttpStatus.UNAUTHORIZED, "Unauthorized", "MISSING_CLERK_ID"))
  }

  const account = await prisma.consumerAccount.findUnique({
    where : { clerkId: customerClerkUserId },
    select: ACCOUNT_SELECT,
  })

  /*
   * A verified Clerk token with no row behind it means the signup webhook has
   * not landed yet (or was never wired). Svix normally delivers in well under a
   * second, but a customer who signs up and immediately calls the API can beat
   * it.
   *
   * 503 with its own code, deliberately not 401: nothing is wrong with their
   * credentials, the record simply is not there yet, so the client should retry
   * rather than bounce them back to a sign-in screen they just completed.
   */
  if (!account) {
    authLog.warn({ clerkId: customerClerkUserId }, "No consumer account for a verified customer token")
    return next(new ApiError(
      HttpStatus.SERVICE_UNAVAILABLE,
      "Your account is still being set up. Try again in a moment.",
      "CUSTOMER_ACCOUNT_PENDING",
    ))
  }

  if (account.status === ConsumerStatus.DELETED || account.deletedAt) {
    return next(new ApiError(HttpStatus.FORBIDDEN, "This account no longer exists.", "CUSTOMER_DELETED"))
  }

  if (account.status === ConsumerStatus.SUSPENDED) {
    authLog.warn({ consumerId: account.id }, "Blocked request — customer suspended")
    return next(new ApiError(
      HttpStatus.FORBIDDEN,
      account.suspensionReason ?? "This account has been suspended.",
      "CUSTOMER_SUSPENDED",
    ))
  }

  ;(req as CustomerRequest).customer = toDomain(account)
  next()
}

/*
 * STEP 1+2 (OPTIONAL) — for the public browsing surface.
 *
 * Attaches req.customer when a valid customer token is present and the account
 * is in good standing; otherwise the request continues anonymously. It NEVER
 * rejects, which is the whole point: browsing restaurants, opening a storefront
 * and pricing a basket all work signed-out on every marketplace this is
 * modelled on, and demanding an account to look at a menu loses the person who
 * has not decided to order yet.
 *
 * A suspended customer browses as an anonymous visitor rather than being
 * refused — they can look, and the refusal lands where it actually means
 * something (their own account, and later checkout).
 */
export async function attachCustomerContext(req: Request, _res: Response, next: NextFunction) {
  try {
    const clerkId = await resolveOptionalCustomerToken(req)
    if (!clerkId) {
      ;(req as MaybeCustomerRequest).customer = null
      return next()
    }

    const account = await prisma.consumerAccount.findUnique({
      where : { clerkId },
      select: ACCOUNT_SELECT,
    })

    const usable = account && account.status === ConsumerStatus.ACTIVE && !account.deletedAt
    ;(req as MaybeCustomerRequest).customer = usable ? toDomain(account) : null
    next()
  } catch (err) {
    // A public route must not fail because an optional lookup did.
    authLog.warn({ err }, "Optional customer context failed — continuing anonymously")
    ;(req as MaybeCustomerRequest).customer = null
    next()
  }
}
