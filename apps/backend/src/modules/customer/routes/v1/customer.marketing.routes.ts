import { Router } from "express"

import { handleGetHeroPromotion } from "../../controllers/customer.marketing.controller"

/*
 * PUBLIC, and with no auth middleware at all — not even attachCustomerContext.
 *
 * That is deliberate rather than an omission. The discovery routes attach an
 * optional identity because they use one thing from it: resolving a saved
 * address. The hero needs nothing from a visitor except where they are, which
 * arrives in the query. Verifying a token we would then ignore costs a round
 * trip per request and, worse, would make the response look person-specific
 * when it is not.
 *
 * Because the answer depends only on location, it is cacheable per location
 * and identical for signed-in and signed-out visitors — which is exactly the
 * property the storefront's static rendering depends on.
 */
const marketingRouter: Router = Router()

marketingRouter.get("/hero-promotion", handleGetHeroPromotion)

export default marketingRouter
