import type { Request, RequestHandler } from "express"
import type { CustomerRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { getCustomerSession, updateCustomerProfile } from "../services/customer.account.service"
import {
  listAddresses, createAddress, updateAddress, setDefaultAddress, deleteAddress,
} from "../services/customer.address.service"

/*
 * The signed-in half of the customer API.
 *
 * Every route behind these handlers runs the REQUIRED auth chain, so
 * req.customer is guaranteed — unlike the discovery controller, where it is
 * optional by design.
 *
 * Bodies are destructured field by field, never spread. On this module in
 * particular a spread would let a client set `status`, `countryId` or
 * `isDefault` on rows it has no business deciding.
 */

function customerOf(req: Request) {
  return (req as CustomerRequest).customer
}

//* GET /customer/v1/auth/session
export const handleGetSession: RequestHandler = async (req, res, next) => {
  try {
    return sendSuccess(res, await getCustomerSession(customerOf(req)), "Session fetched")
  } catch (err) { next(err) }
}

//* PATCH /customer/v1/me
export const handleUpdateProfile: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown> | undefined
    const updated = await updateCustomerProfile(customerOf(req).id, {
      fullName: body?.fullName as string | null | undefined,
      phone   : body?.phone as string | null | undefined,
    })
    return sendSuccess(res, updated, "Profile updated")
  } catch (err) { next(err) }
}

//* GET /customer/v1/addresses
export const handleListAddresses: RequestHandler = async (req, res, next) => {
  try {
    return sendSuccess(res, await listAddresses(customerOf(req).id), "Addresses fetched")
  } catch (err) { next(err) }
}

/** The fields a client may set on an address. Pulled out so create and update
 *  can never drift on which they accept — the same reason the vendor menu
 *  controller shares one mapper. */
function addressInputFrom(body: Record<string, unknown> | undefined) {
  return {
    label       : body?.label as string | null | undefined,
    addressLine1: body?.addressLine1 as string,
    addressLine2: body?.addressLine2 as string | null | undefined,
    city        : body?.city as string,
    postalCode  : body?.postalCode as string | null | undefined,
    countryId   : body?.countryId as string,
    latitude    : body?.latitude as number | null | undefined,
    longitude   : body?.longitude as number | null | undefined,
    isDefault   : body?.isDefault === true,
  }
}

//* POST /customer/v1/addresses
export const handleCreateAddress: RequestHandler = async (req, res, next) => {
  try {
    const address = await createAddress(customerOf(req).id, addressInputFrom(req.body))
    return sendSuccess(res, address, "Address saved", 201)
  } catch (err) { next(err) }
}

//* PUT /customer/v1/addresses/:addressId
export const handleUpdateAddress: RequestHandler = async (req, res, next) => {
  try {
    const address = await updateAddress(
      customerOf(req).id, req.params.addressId!, addressInputFrom(req.body),
    )
    return sendSuccess(res, address, "Address updated")
  } catch (err) { next(err) }
}

//* PATCH /customer/v1/addresses/:addressId/default
export const handleSetDefaultAddress: RequestHandler = async (req, res, next) => {
  try {
    const address = await setDefaultAddress(customerOf(req).id, req.params.addressId!)
    return sendSuccess(res, address, "Default address set")
  } catch (err) { next(err) }
}

//* DELETE /customer/v1/addresses/:addressId
export const handleDeleteAddress: RequestHandler = async (req, res, next) => {
  try {
    const result = await deleteAddress(customerOf(req).id, req.params.addressId!)
    return sendSuccess(res, result, "Address removed")
  } catch (err) { next(err) }
}
