import { Router } from "express"
import {
  handleListOutlets,
  handleGetOutlet,
  handleCreateOutlet,
  handleUpdateOutlet,
  handleDeactivateOutlet,
  handleReactivateOutlet,
  handleCloseOutletTemporarily,
  handleReopenOutlet,
  handleSetPrimaryOutlet,
  handleSetOperatingHours,
} from "../../controllers/vendor.outlet.controller"

const outletRouter: Router = Router()

//* /api/vendors/v1/outlets

outletRouter.get("/",    handleListOutlets)
outletRouter.post("/",   handleCreateOutlet)

outletRouter.get("/:id",    handleGetOutlet)
outletRouter.patch("/:id",  handleUpdateOutlet)

//* Activation / closure
outletRouter.post("/:id/deactivate",         handleDeactivateOutlet)
outletRouter.post("/:id/reactivate",         handleReactivateOutlet)
outletRouter.post("/:id/close-temporarily",  handleCloseOutletTemporarily)
outletRouter.post("/:id/reopen",             handleReopenOutlet)

//* Other operations
outletRouter.post("/:id/set-primary",        handleSetPrimaryOutlet)
outletRouter.put("/:id/operating-hours",     handleSetOperatingHours)

export default outletRouter