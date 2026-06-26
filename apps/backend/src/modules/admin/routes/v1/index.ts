import { Router } from "express"
import authRouter from "./admin.auth.routes"
import usersRouter from "./admin.user.routes"
import vendorsRouter from "./admin.vendor.routes"
import deliveryzoneRouter from "./admin.deliveryzone.routes"
import serviceAreaRouter from "./admin.servicearea.routes"
import citiesRouter from "./admin.city.routes"
import countriesRouter from "./admin.country.routes"
import kpiRouter from "./admin.kpi.routes"

const v1Router: Router = Router()

v1Router.use("/auth", authRouter)
v1Router.use("/users", usersRouter)
v1Router.use("/vendors", vendorsRouter)
v1Router.use("/delivery-zones", deliveryzoneRouter)
v1Router.use("/service-areas", serviceAreaRouter)
v1Router.use("/cities", citiesRouter)
v1Router.use("/countries", countriesRouter)
v1Router.use("/kpis", kpiRouter)

export default v1Router