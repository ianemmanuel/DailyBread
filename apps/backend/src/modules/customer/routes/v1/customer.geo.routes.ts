import { Router } from "express"

import { handleGetCity, handleListMarkets } from "../../controllers/customer.geo.controller"

/*
 * PUBLIC, with no auth middleware at all — the same posture as the marketing
 * router and for the same reason.
 *
 * "Which cities do you deliver to" is the question a visitor asks BEFORE they
 * have any reason to have an account, and the answer is the same for everyone.
 * Attaching an identity we would then ignore would cost a round trip per
 * request and make a wholly public answer look person-specific.
 *
 * Nothing here exposes geometry. A boundary is operational detail — the picker
 * needs a name and a slug, and the backend remains the only thing that decides
 * whether a POINT falls inside one (principle 1).
 */
const geoRouter: Router = Router()

geoRouter.get("/geo/markets", handleListMarkets)

//* One city and the areas we operate in. Registered after the literal segment
//* above so /geo/markets can never be read as a city slug.
geoRouter.get("/geo/cities/:citySlug", handleGetCity)

export default geoRouter
