import type { Request, RequestHandler } from "express"
import type { MaybeCustomerRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { discoverOutlets, resolveDiscoveryLocation } from "../services/customer.discovery.service"
import { getStorefront } from "../services/customer.storefront.service"
import { priceCustomerCart } from "../services/customer.cart.service"

/*
 * The public browsing surface.
 *
 * Every handler here reads req.customer OPTIONALLY — these routes work
 * signed-out, which is how every marketplace this is modelled on behaves. An
 * identity is used for exactly one thing: resolving a saved address id.
 *
 * Controllers stay thin. They map the request into service arguments and hand
 * back what the service returned; every decision, every price and every
 * eligibility rule lives in the services, so nothing here can produce an answer
 * a different caller of the same service would not.
 *
 * Query and body fields are read one at a time, never spread. A spread is how a
 * client ends up setting something it was never offered.
 */

/** Null for an anonymous visitor. Never throws — that is the point. */
function customerIdOf(req: Request): string | null {
  return (req as MaybeCustomerRequest).customer?.id ?? null
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined
}

function num(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function bool(value: unknown): boolean | undefined {
  if (value === "true") return true
  if (value === "false") return false
  return undefined
}

/** Repeatable query params arrive as a string or an array depending on how many
 *  were sent; both become a clean list of ids. */
function ids(value: unknown): string[] | undefined {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : []
  const list = raw.map((v) => String(v).trim()).filter(Boolean)
  return list.length > 0 ? list : undefined
}

//* GET /customer/v1/discovery/serviceability?latitude=&longitude=&addressId=
export const handleCheckServiceability: RequestHandler = async (req, res, next) => {
  try {
    const resolved = await resolveDiscoveryLocation({
      latitude : num(req.query.latitude),
      longitude: num(req.query.longitude),
      addressId: str(req.query.addressId),
    }, customerIdOf(req))

    return sendSuccess(res, resolved.serviceability, "Serviceability resolved")
  } catch (err) { next(err) }
}

//* GET /customer/v1/discovery/outlets?latitude=&longitude=&addressId=&…filters
export const handleDiscoverOutlets: RequestHandler = async (req, res, next) => {
  try {
    const result = await discoverOutlets(
      {
        latitude : num(req.query.latitude),
        longitude: num(req.query.longitude),
        addressId: str(req.query.addressId),
      },
      {
        search       : str(req.query.search),
        cuisineIds   : ids(req.query.cuisineId),
        dietaryTagIds: ids(req.query.dietaryTagId),
        openNow      : bool(req.query.openNow),
        hasOffer     : bool(req.query.hasOffer),
        freeDelivery : bool(req.query.freeDelivery),
        maxDeliveryMinutes: num(req.query.maxDeliveryMinutes),
        minRating    : num(req.query.minRating),
        sort         : str(req.query.sort) as never,
        page         : num(req.query.page),
        pageSize     : num(req.query.pageSize),
      },
      customerIdOf(req),
    )

    return sendSuccess(res, result, "Restaurants fetched")
  } catch (err) { next(err) }
}

//* GET /customer/v1/outlets/:outletId?latitude=&longitude=
export const handleGetStorefront: RequestHandler = async (req, res, next) => {
  try {
    const latitude = num(req.query.latitude)
    const longitude = num(req.query.longitude)

    // A shared link opens without a location, so the menu renders and only the
    // distance and delivery estimate are withheld.
    const location = latitude !== undefined && longitude !== undefined
      ? { latitude, longitude }
      : null

    return sendSuccess(res, await getStorefront(req.params.outletId!, location), "Storefront fetched")
  } catch (err) { next(err) }
}

//* POST /customer/v1/cart/price
export const handlePriceCart: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown> | undefined

    /*
     * Field by field. The client sends ids and quantities and nothing else —
     * no prices, no discount ids, no totals — so there is nothing here a
     * crafted request could use to change what something costs.
     */
    const lines = Array.isArray(body?.lines) ? body.lines : []

    const priced = await priceCustomerCart({
      outletId: String(body?.outletId ?? ""),
      lines   : lines.map((line: Record<string, unknown>) => ({
        menuItemId: String(line?.menuItemId ?? ""),
        quantity  : Number(line?.quantity ?? 0),
        selectedOptionIds: Array.isArray(line?.selectedOptionIds)
          ? line.selectedOptionIds.map((id: unknown) => String(id))
          : [],
      })),
    })

    return sendSuccess(res, priced, "Cart priced")
  } catch (err) { next(err) }
}
