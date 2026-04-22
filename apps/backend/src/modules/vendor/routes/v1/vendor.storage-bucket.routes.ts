import { Router } from "express"
import { generateFileUploadUrl } from "../../controllers/vendor.storageBucket.controller"

const storageBucketRouter: Router = Router()

storageBucketRouter.post("/presign", generateFileUploadUrl)

export default storageBucketRouter