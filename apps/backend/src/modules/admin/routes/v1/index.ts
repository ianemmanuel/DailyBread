import { Router } from "express"
import authRouter from "./admin.auth.routes"
import usersRouter from "./admin.user.routes"
import vendorsRouter from "./admin.vendor.routes"
import geographyRouter from "./admin.geography.routes"

const v1Router: Router = Router()

v1Router.use("/auth", authRouter)
v1Router.use("/users", usersRouter)
v1Router.use("/vendors",   vendorsRouter)
v1Router.use("/geography", geographyRouter)

export default v1Router