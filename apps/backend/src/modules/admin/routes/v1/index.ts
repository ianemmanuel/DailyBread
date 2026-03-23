import { Router } from "express"
import authRouter from "./auth.routes"
// Future imports uncommented as each build completes:
// import usersRouter    from "./users.routes"
// import vendorsRouter  from "./vendors.routes"
// import geographyRouter from "./geography.routes"

const v1Router: Router = Router()

v1Router.use("/auth",    authRouter)
// v1Router.use("/users",     usersRouter)
// v1Router.use("/vendors",   vendorsRouter)
// v1Router.use("/geography", geographyRouter)

export default v1Router