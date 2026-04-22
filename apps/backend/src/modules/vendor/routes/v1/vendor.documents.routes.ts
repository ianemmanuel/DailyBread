import { Router } from "express"
import {
  upsertDocument,
  deleteDocument,
  getApplicationDocuments,
  previewDocument,
  presignUpload,
} from "../../controllers/vendor.document.controller"

const documentRouter:Router = Router()

documentRouter.post("/presign", presignUpload)
documentRouter.post("/upsert", upsertDocument)
documentRouter.delete("delete/:id", deleteDocument)
documentRouter.get("/:id/preview", previewDocument)
documentRouter.get("/requirements/:applicationId", getApplicationDocuments)

export default documentRouter
