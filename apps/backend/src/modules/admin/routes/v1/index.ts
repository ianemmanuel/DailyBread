import { Router } from "express"
import authRouter from "./admin.auth.routes"
import usersRouter from "./admin.user.routes"
import vendorsRouter from "./admin.vendor.routes"
import customersRouter from "./admin.customer.routes"
import deliveryzoneRouter from "./admin.deliveryzone.routes"
import serviceAreaRouter from "./admin.servicearea.routes"
import zoneRouter from "./admin.zone.routes"
import marketSignalRouter from "./admin.marketSignal.routes"
import citiesRouter from "./admin.city.routes"
import countriesRouter from "./admin.country.routes"
import kpiRouter from "./admin.kpi.routes"
import regionsRouter from "./admin.region.routes"
import vendorTypesRouter from "./admin.vendorType.routes"
import foodTagsRouter from "./admin.foodTag.routes"
import documentTypesRouter from "./admin.documentType.routes"
import reviewerAvailabilityRouter from "./admin.reviewerAvailability.routes"
import actionReasonsRouter from "./admin.actionReason.routes"
import auditRouter from "./admin.audit.routes"
import notificationsRouter from "./admin.notification.routes"
import paymentMethodsRouter from "./admin.paymentMethod.routes"
import financeRouter from "./admin.finance.routes"
import { financeAdminRouter } from "@/modules/finance"
import { taxAdminRouter } from "@/modules/tax"
import { marketingAdminRouter } from "@/modules/marketing"
import { mealsAdminRouter } from "@/modules/meals"

/*
 * The /admin/v1 mount table — declared as DATA so the route-manifest test
 * (routes/v1/route-manifest.test.ts) walks exactly what ships. Order matters
 * and is preserved: the first matching mount wins.
 */
export const ADMIN_V1_MOUNTS: ReadonlyArray<readonly [path: string, router: Router]> = [

  ["/auth", authRouter],
  ["/users", usersRouter],
/*
 * Meal moderation — owned by the meals module, at the URL it always had. It
 * must be mounted BEFORE the vendors router: /vendors/meals would otherwise be
 * offered to the vendors router first, whose parameterised routes could claim
 * it. Same auth inheritance as tax and marketing below.
 */
  ["/vendors/meals", mealsAdminRouter],
  ["/vendors", vendorsRouter],
  ["/customers", customersRouter],
  ["/delivery-zones", deliveryzoneRouter],
  ["/service-areas", serviceAreaRouter],
  ["/zones", zoneRouter],
  ["/market-signals", marketSignalRouter],
  ["/cities", citiesRouter],
  ["/countries", countriesRouter],
  ["/regions", regionsRouter],
  ["/vendor-types", vendorTypesRouter],
  ["/food-tags", foodTagsRouter],
  ["/document-types", documentTypesRouter],
  ["/vendor-reviewers", reviewerAvailabilityRouter],
  ["/action-reasons", actionReasonsRouter],
  ["/audit", auditRouter],
  ["/notifications", notificationsRouter],
  ["/payment-methods", paymentMethodsRouter],
// Two routers share the /finance mount, deliberately: `financeRouter`
// (admin.finance.*) holds the pre-existing revenue-reporting lookups
// (/finance/outlets, /finance/cities); `financeAdminRouter` (the new
// Finance module) owns platform financial configuration
// (/finance/providers, /finance/currencies). Non-overlapping paths. They
// converge into the Finance module in a later phase.
  ["/finance", financeRouter],
  ["/finance", financeAdminRouter],
//* Consumption tax — its own module, not nested under finance.
  ["/tax", taxAdminRouter],
/*
 * Storefront merchandising — its own module, mounted here so it inherits the
 * full adminAuthChain (token -> user -> active -> permissions -> scope) that
 * adminRouter applies before `/v1`, exactly like tax and finance.
 */
  ["/marketing", marketingAdminRouter],
  ["/kpis", kpiRouter],
]

const v1Router: Router = Router()
for (const [path, router] of ADMIN_V1_MOUNTS) v1Router.use(path, router)

export default v1Router