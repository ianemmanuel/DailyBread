import { Router } from "express"
import authRouter from "./admin.auth.routes"
import usersRouter from "./admin.user.routes"
import vendorsRouter from "./admin.vendor.routes"
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

const v1Router: Router = Router()

v1Router.use("/auth", authRouter)
v1Router.use("/users", usersRouter)
v1Router.use("/vendors", vendorsRouter)
v1Router.use("/delivery-zones", deliveryzoneRouter)
v1Router.use("/service-areas", serviceAreaRouter)
v1Router.use("/zones", zoneRouter)
v1Router.use("/market-signals", marketSignalRouter)
v1Router.use("/cities", citiesRouter)
v1Router.use("/countries", countriesRouter)
v1Router.use("/regions", regionsRouter)
v1Router.use("/vendor-types", vendorTypesRouter)
v1Router.use("/food-tags", foodTagsRouter)
v1Router.use("/document-types", documentTypesRouter)
v1Router.use("/vendor-reviewers", reviewerAvailabilityRouter)
v1Router.use("/action-reasons", actionReasonsRouter)
v1Router.use("/audit", auditRouter)
v1Router.use("/notifications", notificationsRouter)
v1Router.use("/payment-methods", paymentMethodsRouter)
// Two routers share the /finance mount, deliberately: `financeRouter`
// (admin.finance.*) holds the pre-existing revenue-reporting lookups
// (/finance/outlets, /finance/cities); `financeAdminRouter` (the new
// Finance module) owns platform financial configuration
// (/finance/providers, /finance/currencies). Non-overlapping paths. They
// converge into the Finance module in a later phase.
v1Router.use("/finance", financeRouter)
v1Router.use("/finance", financeAdminRouter)
//* Consumption tax — its own module, not nested under finance.
v1Router.use("/tax", taxAdminRouter)
/*
 * Storefront merchandising — its own module, mounted here so it inherits the
 * full adminAuthChain (token -> user -> active -> permissions -> scope) that
 * adminRouter applies before `/v1`, exactly like tax and finance.
 */
v1Router.use("/marketing", marketingAdminRouter)
v1Router.use("/kpis", kpiRouter)

export default v1Router