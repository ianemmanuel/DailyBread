import { Request, Response, NextFunction } from "express"
import { getVendorAccount } from "@/helpers/auth/vendorAuth"
import { ApiError } from "@/middleware/error"
import { sendSuccess } from "@/helpers/api-response/response"
import {
  addPayoutAccount,
  removePayoutAccount,
  setDefaultPayoutAccount,
  listPayoutAccounts,
  getPayoutAccount,
  getAvailablePayoutMethods,
} from "../services/vendor.payout.service"
import type { AddPayoutAccountInput, idParam } from "@/types/vendor"


//* GET available payout methods for the vendor's country
export const handleGetAvailablePayoutMethods = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const methods = await getAvailablePayoutMethods(auth.vendorAccount.id)
    return sendSuccess(res, methods, "Available payout methods fetched")
  } catch (err) { next(err) }
}


//* GET all payout accounts for the vendor
export const handleListPayoutAccounts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const accounts = await listPayoutAccounts(auth.vendorAccount.id)
    return sendSuccess(res, accounts, "Payout accounts fetched")
  } catch (err) { next(err) }
}


//* GET a single payout account
export const handleGetPayoutAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const { id } = req.params as idParam
    const account = await getPayoutAccount(auth.vendorAccount.id, id)
    return sendSuccess(res, account, "Payout account fetched")
  } catch (err) { next(err) }
}


//* ADD a payout account
export const handleAddPayoutAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const {
      countryPaymentMethodId, accountHolderName,
      mobileNetwork, mobileNumber,
      bankName, branchName, bankCode, accountNumber, swiftCode, iban, routingNumber,
      paypalEmail, stripeAccountId,
    } = req.body

    if (!countryPaymentMethodId || !accountHolderName) {
      throw new ApiError(400, "countryPaymentMethodId and accountHolderName are required", "MISSING_FIELDS")
    }

    const input: AddPayoutAccountInput = {
      countryPaymentMethodId, accountHolderName,
      mobileNetwork, mobileNumber,
      bankName, branchName, bankCode, accountNumber, swiftCode, iban, routingNumber,
      paypalEmail, stripeAccountId,
    }

    const account = await addPayoutAccount(auth.vendorAccount.id, input)
    return sendSuccess(res, account, "Payout account added successfully", 201)
  } catch (err) { next(err) }
}


//* SET default payout account
export const handleSetDefaultPayoutAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const { id } = req.params as idParam
    const result = await setDefaultPayoutAccount(auth.vendorAccount.id, id)
    return sendSuccess(res, result, "Default payout account updated")
  } catch (err) { next(err) }
}


//* REMOVE a payout account
export const handleRemovePayoutAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const { id } = req.params as idParam
    const result = await removePayoutAccount(auth.vendorAccount.id, id)
    return sendSuccess(res, result, "Payout account removed")
  } catch (err) { next(err) }
}