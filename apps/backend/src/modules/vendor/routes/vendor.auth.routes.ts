import { Router } from "express"
import { getVendorSession } from "../controllers/vendor.session.controller"

const authRouter: Router = Router()

//* GET /api/vendors/v1/auth/session
authRouter.get("/session", getVendorSession)

export default authRouter