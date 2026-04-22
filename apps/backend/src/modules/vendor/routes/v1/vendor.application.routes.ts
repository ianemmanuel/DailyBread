import { Router } from "express"
import {
  getApplication,
  upsertApplication,
  submitApplication,
  previewApplication,
} from "../../controllers/vendor.application.controller"

const applicationRouter: Router = Router()

//* /api/vendors/v1/applications
applicationRouter.get("/", getApplication)
applicationRouter.post("/upsert-application", upsertApplication)
applicationRouter.post("/submit/:id", submitApplication)
applicationRouter.get("/:id/preview", previewApplication)

export default applicationRouter