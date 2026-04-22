import { prisma, PayoutVerificationStatus, PaymentDirection } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { AddPayoutAccountInput } from "@/types/vendor"

const serviceLog = logger.child({ module: "vendor-payout-service" })


// Validates that the CountryPaymentMethod exists, is ACTIVE, is OUTBOUND,
// and belongs to the vendor's registered country.
async function assertValidPayoutMethod(
  countryPaymentMethodId: string,
  vendorCountryId       : string,
) {
  const method = await prisma.countryPaymentMethod.findUnique({
    where  : { id: countryPaymentMethodId },
    include: { paymentMethod: { select: { name: true, type: true } } },
  })

  if (!method) throw new ApiError(404, "Payment method not found", "NOT_FOUND")
  if (method.countryId !== vendorCountryId) throw new ApiError(400, "This payment method is not available in your country", "COUNTRY_MISMATCH")
  if (method.direction !== PaymentDirection.OUTBOUND) throw new ApiError(400, "This payment method cannot be used for payouts", "WRONG_DIRECTION")
  if (method.status !== "ACTIVE") throw new ApiError(400, "This payment method is currently unavailable", "METHOD_INACTIVE")

  return method
}

//* Add payout account

export async function addPayoutAccount(
  vendorId: string,
  input   : AddPayoutAccountInput,
) {
  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { id: true, countryId: true, status: true },
  })
  if (!vendor) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (vendor.status !== "ACTIVE") throw new ApiError(403, "Your account has been deactivated", "ACCOUNT_INACTIVE")

  const method = await assertValidPayoutMethod(input.countryPaymentMethodId, vendor.countryId)

  // Enforce minimum required fields based on method type
  const type = method.paymentMethod.type
  if (type === "MOBILE_MONEY" && !input.mobileNumber) {
    throw new ApiError(400, "mobileNumber is required for mobile money accounts", "MISSING_FIELDS")
  }
  if (type === "BANK" && (!input.accountNumber || !input.bankName)) {
    throw new ApiError(400, "accountNumber and bankName are required for bank accounts", "MISSING_FIELDS")
  }
  if (type === "DIGITAL_WALLET" && !input.paypalEmail && !input.stripeAccountId) {
    throw new ApiError(400, "A wallet identifier is required", "MISSING_FIELDS")
  }

  // If this is the vendor's first payout account, make it default automatically
  const existingCount = await prisma.vendorPayoutAccount.count({
    where: { vendorId, isActive: true, deletedAt: null },
  })
  const isDefault = existingCount === 0

  const account = await prisma.vendorPayoutAccount.create({
    data: {
      vendorId,
      countryPaymentMethodId: input.countryPaymentMethodId,
      isDefault,
      accountHolderName : input.accountHolderName,
      mobileNetwork     : input.mobileNetwork     ?? null,
      mobileNumber      : input.mobileNumber      ?? null,
      bankName          : input.bankName          ?? null,
      branchName        : input.branchName        ?? null,
      bankCode          : input.bankCode          ?? null,
      accountNumber     : input.accountNumber     ?? null,
      swiftCode         : input.swiftCode         ?? null,
      iban              : input.iban              ?? null,
      routingNumber     : input.routingNumber     ?? null,
      paypalEmail       : input.paypalEmail       ?? null,
      stripeAccountId   : input.stripeAccountId   ?? null,
      verificationStatus: PayoutVerificationStatus.PENDING,
    },
    include: {
      countryPaymentMethod: {
        include: { paymentMethod: { select: { name: true, type: true, logoUrl: true } } },
      },
    },
  })

  serviceLog.info({ vendorId, accountId: account.id, methodType: type }, "Payout account added")

  // Trigger async verification — fire and forget, status tracked on the record
  triggerVerification(account.id, method.verificationProvider, method.verificationConfig).catch(err => {
    serviceLog.error({ err, accountId: account.id }, "Verification trigger failed")
  })

  return account
}

//* Remove payout account 

export async function removePayoutAccount(vendorId: string, accountId: string) {
    const account = await prisma.vendorPayoutAccount.findUnique({
        where: { id: accountId },
    })

    if (!account || account.deletedAt) throw new ApiError(404, "Payout account not found", "NOT_FOUND")
    if (account.vendorId !== vendorId) throw new ApiError(403, "Unauthorized", "FORBIDDEN")

    if (account.isDefault) {
        // Check if there's another account that can take over as default
        const others = await prisma.vendorPayoutAccount.count({
        where: { vendorId, isActive: true, deletedAt: null, id: { not: accountId } },
        })
        if (others === 0) {
        throw new ApiError(
            400,
            "You cannot remove your only payout account. Add another account first.",
            "CANNOT_REMOVE_ONLY_ACCOUNT",
        )
        }
        // Auto-promote the oldest remaining account to default
        const next = await prisma.vendorPayoutAccount.findFirst({
        where  : { vendorId, isActive: true, deletedAt: null, id: { not: accountId } },
        orderBy: { createdAt: "asc" },
        })
        if (next) {
        await prisma.vendorPayoutAccount.update({
            where: { id: next.id },
            data : { isDefault: true },
        })
        }
    }

    await prisma.vendorPayoutAccount.update({
        where: { id: accountId },
        data : { isActive: false, deletedAt: new Date(), isDefault: false },
    })

    serviceLog.info({ vendorId, accountId }, "Payout account removed")
    return { success: true }
}

//* Set default payout account

export async function setDefaultPayoutAccount(vendorId: string, accountId: string) {
    const account = await prisma.vendorPayoutAccount.findUnique({
        where: { id: accountId },
    })

    if (!account || account.deletedAt) throw new ApiError(404, "Payout account not found", "NOT_FOUND")
    if (account.vendorId !== vendorId)  throw new ApiError(403, "Unauthorized", "FORBIDDEN")
    if (!account.isActive) throw new ApiError(400, "This account is not active", "ACCOUNT_INACTIVE")

    if (account.verificationStatus !== PayoutVerificationStatus.VERIFIED) {
        throw new ApiError(
        400,
        "Only verified accounts can be set as default",
        "ACCOUNT_NOT_VERIFIED",
        )
    }

    await prisma.$transaction([
        prisma.vendorPayoutAccount.updateMany({
        where: { vendorId, deletedAt: null },
        data : { isDefault: false },
        }),
        prisma.vendorPayoutAccount.update({
        where: { id: accountId },
        data : { isDefault: true },
        }),
    ])

    serviceLog.info({ vendorId, accountId }, "Default payout account updated")
    return { success: true }
}

//* List payout accounts 

export async function listPayoutAccounts(vendorId: string) {
  return prisma.vendorPayoutAccount.findMany({
    where  : { vendorId, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: {
      countryPaymentMethod: {
        include: { paymentMethod: { select: { name: true, type: true, logoUrl: true, code: true } } },
      },
    },
  })
}

//* Get single payout account
// Returns full detail including verification status, method type, and account identifiers.
// Useful for the "manage account" settings page and troubleshooting failed verifications.
// Sensitive fields (full account numbers) are intentionally included here since
// this endpoint is authenticated and scoped to the owning vendor.

export async function getPayoutAccount(vendorId: string, accountId: string) {
  const account = await prisma.vendorPayoutAccount.findUnique({
    where  : { id: accountId },
    include: {
      countryPaymentMethod: {
        include: {
          paymentMethod: { select: { name: true, type: true, logoUrl: true, code: true, description: true } },
        },
      },
    },
  })

  if (!account || account.deletedAt) throw new ApiError(404, "Payout account not found", "NOT_FOUND")
  if (account.vendorId !== vendorId)  throw new ApiError(403, "Unauthorized", "FORBIDDEN")

  return account
}

//* Get available payout methods for vendor's country

export async function getAvailablePayoutMethods(vendorId: string) {
  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { countryId: true },
  })
  if (!vendor) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")

  return prisma.countryPaymentMethod.findMany({
    where  : {
      countryId: vendor.countryId,
      direction: PaymentDirection.OUTBOUND,
      status   : "ACTIVE",
    },
    orderBy: { displayOrder: "asc" },
    include: {
      paymentMethod: { select: { name: true, type: true, logoUrl: true, code: true, description: true } },
    },
  })
}

//* Verification trigger 
// Kicks off the appropriate verification flow based on the provider config
// stored on CountryPaymentMethod. Runs asynchronously after account creation.
// Updates the account record with the result.

async function triggerVerification(
  accountId           : string,
  verificationProvider: string | null,
  verificationConfig  : unknown,
) {
  if (!verificationProvider || verificationProvider === "MANUAL") {
    // Manual verification — stays PENDING until an admin marks it verified
    serviceLog.info({ accountId }, "Payout account queued for manual verification")
    return
  }

  // Future: dispatch to a queue (BullMQ / SQS) with the provider + config.
  // The worker then calls the appropriate API (Daraja, Africa's Talking, etc.)
  // and updates verificationStatus + verificationRef + verificationMeta.
  //
  // For now, log that verification was requested so the job can be picked up.
  serviceLog.info(
    { accountId, verificationProvider },
    "Payout account queued for API verification",
  )

  // TODO: enqueue verification job
  // await verificationQueue.add("verify-payout-account", { accountId, verificationProvider, verificationConfig })
}