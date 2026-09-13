import { Router } from "express"
import { attachCustomerContext } from "../../middlewares"
import {
  handleCheckServiceability,
  handleDiscoverOutlets,
  handleGetStorefront,
  handlePriceCart,
} from "../../controllers/customer.discovery.controller"

/*
 * PUBLIC. Browsing works signed-out.
 *
 * attachCustomerContext, not the required chain: it resolves an identity when
 * one is present and continues anonymously when it is not, and never rejects.
 * Uber Eats, DoorDash and Bolt Food all let you browse restaurants and build a
 * basket before signing in, and demanding an account to look at a menu loses
 * the person who has not decided to order yet.
 *
 * The identity, when there is one, is used for exactly one thing: resolving a
 * saved address id into a location. Everything else on these routes is the
 * same for everybody, which is also why nothing here is per-customer cacheable
 * data that could leak between visitors.
 */
const discoveryRouter: Router = Router()

discoveryRouter.use(attachCustomerContext)

//* Does the platform deliver to this point at all? Answered on its own so the
//* app can say "we are not here yet" without pretending to search.
discoveryRouter.get("/discovery/serviceability", handleCheckServiceability)

//* The feed.
discoveryRouter.get("/discovery/outlets", handleDiscoverOutlets)

//* One storefront and its menu.
discoveryRouter.get("/outlets/:outletId", handleGetStorefront)

/*
 * Pricing a basket.
 *
 * A POST because the basket is sent in the body and can be long, not because
 * anything is written — this endpoint stores nothing. The client holds the
 * lines and re-prices on every change; the server is the only thing that ever
 * decides what something costs.
 */
discoveryRouter.post("/cart/price", handlePriceCart)

export default discoveryRouter
