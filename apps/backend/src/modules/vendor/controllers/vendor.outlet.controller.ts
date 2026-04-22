import { Request, Response, NextFunction } from "express"
import { getVendorAccount } from "@/helpers/auth/vendorAuth"
import { ApiError } from "@/middleware/error"
import { sendSuccess } from "@/helpers/api-response/response"
import {
  createOutlet,
  updateOutlet,
  getOutlet,
  listOutlets,
  deactivateOutlet,
  reactivateOutlet,
  closeOutletTemporarily,
  reopenOutlet,
  setPrimaryOutlet,
  setOperatingHours,
} from "../services/vendor.outlet.service"
import type { CreateOutletInput, UpdateOutletInput, OperatingHoursEntry } from "@/types/vendor"

type idParam = { id: string }


//* GET all outlets for the authenticated vendor
export const handleListOutlets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const outlets = await listOutlets(auth.vendorAccount.id)
    return sendSuccess(res, outlets, "Outlets fetched successfully")
  } catch (err) { 
      next(err) 
    }
}


//* GET a single outlet
export const handleGetOutlet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const { id } = req.params as idParam
    const outlet = await getOutlet(auth.vendorAccount.id, id)
    return sendSuccess(res, outlet, "Outlet fetched successfully")
  } catch (err) { next(err) }
}


//* CREATE outlet
export const handleCreateOutlet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const {
      name, addressLine1, addressLine2, cityId, neighborhood,
      postalCode, latitude, longitude, phone, email, bio,
      deliveryRadius, minimumOrder, deliveryFee,
    } = req.body

    if (!name || !addressLine1 || !cityId || latitude == null || longitude == null) {
      throw new ApiError(400, "name, addressLine1, cityId, latitude, and longitude are required", "MISSING_FIELDS")
    }

    const input: CreateOutletInput = {
      name, addressLine1, addressLine2, cityId, neighborhood,
      postalCode,
      latitude     : Number(latitude),
      longitude    : Number(longitude),
      phone, email, bio, deliveryRadius, minimumOrder, deliveryFee,
    }

    const outlet = await createOutlet(auth.vendorAccount.id, input)
    return sendSuccess(res, outlet, "Outlet created successfully", 201)
  } catch (err) { next(err) }
}


//* UPDATE outlet
export const handleUpdateOutlet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const { id } = req.params as idParam
    const {
      name, addressLine1, addressLine2, neighborhood, postalCode,
      phone, email, bio, deliveryRadius, minimumOrder, deliveryFee,
      latitude, longitude,
    } = req.body

    const input: UpdateOutletInput = {
      ...(name           != null ? { name           }                             : {}),
      ...(addressLine1   != null ? { addressLine1   }                             : {}),
      ...(addressLine2   != null ? { addressLine2   }                             : {}),
      ...(neighborhood   != null ? { neighborhood   }                             : {}),
      ...(postalCode     != null ? { postalCode     }                             : {}),
      ...(phone          != null ? { phone          }                             : {}),
      ...(email          != null ? { email          }                             : {}),
      ...(bio            != null ? { bio            }                             : {}),
      ...(deliveryRadius != null ? { deliveryRadius : Number(deliveryRadius) }    : {}),
      ...(minimumOrder   != null ? { minimumOrder   : Number(minimumOrder)   }    : {}),
      ...(deliveryFee    != null ? { deliveryFee    : Number(deliveryFee)    }    : {}),
      ...(latitude       != null ? { latitude       : Number(latitude)       }    : {}),
      ...(longitude      != null ? { longitude      : Number(longitude)      }    : {}),
    }

    const outlet = await updateOutlet(auth.vendorAccount.id, id, input)
    return sendSuccess(res, outlet, "Outlet updated successfully")
  } catch (err) { next(err) }
}


//* DEACTIVATE outlet (vendor-initiated, indefinite)
export const handleDeactivateOutlet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const { id } = req.params as { id: string }
    const result = await deactivateOutlet(auth.vendorAccount.id, id)
    return sendSuccess(res, result, "Outlet deactivated successfully")
  } catch (err) { next(err) }
}


//* REACTIVATE outlet
export const handleReactivateOutlet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const { id } = req.params as idParam
    const result = await reactivateOutlet(auth.vendorAccount.id, id)
    return sendSuccess(res, result, "Outlet reactivated successfully")
  } catch (err) { next(err) }
}


//* TEMPORARILY CLOSE outlet (max 7 days)
export const handleCloseOutletTemporarily = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const { id }       = req.params as idParam
    const { reopenAt } = req.body

    if (!reopenAt) throw new ApiError(400, "reopenAt is required", "MISSING_FIELDS")

    const reopenDate = new Date(reopenAt)
    if (isNaN(reopenDate.getTime())) {
      throw new ApiError(400, "reopenAt must be a valid ISO date", "INVALID_DATE")
    }

    const result = await closeOutletTemporarily(auth.vendorAccount.id, id, reopenDate)
    return sendSuccess(res, result, "Outlet temporarily closed")
  } catch (err) { next(err) }
}


//* REOPEN outlet early (cancel temporary closure)
export const handleReopenOutlet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const { id } = req.params as idParam
    const result = await reopenOutlet(auth.vendorAccount.id, id)
    return sendSuccess(res, result, "Outlet reopened successfully")
  } catch (err) { next(err) }
}


//* SET primary outlet
export const handleSetPrimaryOutlet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const { id } = req.params as idParam
    const result = await setPrimaryOutlet(auth.vendorAccount.id, id)
    return sendSuccess(res, result, "Primary outlet updated successfully")
  } catch (err) { next(err) }
}


//* SET operating hours for an outlet
export const handleSetOperatingHours = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    if (!auth.ok) return next(new ApiError(auth.status, auth.message))

    const { id }    = req.params as idParam
    const { hours } = req.body

    if (!Array.isArray(hours) || hours.length === 0) {
      throw new ApiError(400, "hours must be a non-empty array", "MISSING_FIELDS")
    }

    const result = await setOperatingHours(auth.vendorAccount.id, id, hours as OperatingHoursEntry[])
    return sendSuccess(res, result, "Operating hours updated successfully")
  } catch (err) { next(err) }
}