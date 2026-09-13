import { Router } from "express"
import discoveryRoutes from "./customer.discovery.routes"
import accountRoutes from "./customer.account.routes"

/*
 * /customer/v1
 *
 * Split by AUTHENTICATION, not by resource — which is the split that actually
 * matters here. The discovery half is public and attaches an identity only if
 * one happens to be present; the account half requires one. Each sub-router
 * applies its own chain, so a route can never end up on the wrong one by being
 * added to the wrong file.
 *
 * Deliberately no module-wide auth middleware on this router: mounting the
 * required chain here and exempting routes below it is the shape that
 * eventually leaks, because the exemption list is the thing people forget to
 * update.
 */
const v1Router: Router = Router()

v1Router.use(discoveryRoutes)
v1Router.use(accountRoutes)

export default v1Router
