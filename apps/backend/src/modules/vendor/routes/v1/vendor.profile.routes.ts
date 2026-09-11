import { Router } from "express"
import { requireVendorState } from "../../middlewares"
import {
  handleGetVendorProfile,
  handleUpsertVendorProfile,
  handleGetGoLiveStatus,
  handlePublishVendorProfile,
  handleUnpublishVendorProfile,
  handleGetVendorFoodTags,
  handlePresignProfileMedia,
  handleDiscardProfileMedia,
} from "../../controllers/vendor.profile.controller"

const profileRouter: Router = Router()

//* /vendor/v1/profile — only meaningful once approved, same convention as
//* /account-documents.
profileRouter.use(requireVendorState("ACTIVE"))

profileRouter.get ("/",              handleGetVendorProfile)
profileRouter.put ("/",              handleUpsertVendorProfile)
profileRouter.get ("/go-live-status", handleGetGoLiveStatus)

//* The cuisines / dietary tags this vendor's country has switched on.
profileRouter.get ("/food-tags",     handleGetVendorFoodTags)

//* Profile images. Same presign → PUT to R2 → submit the key pipeline as
//* application documents and payout proofs; the backend never sees the bytes.
profileRouter.post  ("/media/presign", handlePresignProfileMedia)
profileRouter.delete("/media",         handleDiscardProfileMedia)
profileRouter.post("/publish",       handlePublishVendorProfile)
profileRouter.post("/unpublish",     handleUnpublishVendorProfile)

export default profileRouter
