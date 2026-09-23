import { Router } from "express"

import { handleListCuisines } from "../../controllers/customer.catalog.controller"

/*
 * PUBLIC, no auth middleware — the same posture as the marketing and geo
 * routers. What cuisines a market offers is public vocabulary that every
 * storefront already displays, and the answer is the same for everyone in
 * that market.
 */
const catalogRouter: Router = Router()

catalogRouter.get("/catalog/cuisines", handleListCuisines)

export default catalogRouter
