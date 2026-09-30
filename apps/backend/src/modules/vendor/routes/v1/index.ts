import { Request, Response, Router } from "express"
import applicationRouter from './vendor.application.routes'
import documentRouter from './vendor.documents.routes'
import accountDocumentRouter from './vendor.accountDocuments.routes'
import outletRouter from "./vendor.outlet.routes"
import cityRouter from "./vendor.city.routes"
import payoutRouter from "./vendor.payout.routes"
import profileRouter from "./vendor.profile.routes"
import discountRouter from './vendor.discount.routes'
import authRouter from "../vendor.auth.routes"
import { requireVendorState, NON_BANNED_STATES } from "../../middlewares"
import { createMealsVendorRouter } from "@/modules/meals"
import { getDiscountsForMenuItems } from "../../services/vendor.discount.service"

const v1Router: Router = Router()

// Session must stay reachable even for a banned vendor, so it's
// mounted before the ban gate below, not after.
v1Router.use('/auth', authRouter)

// Every other vendor route requires a non-banned identity. Beyond
// that, state-appropriateness for application/document mutations is
// already enforced at the service layer (ensureApplicationEditable).
v1Router.use(requireVendorState(...NON_BANNED_STATES))

v1Router.use('/application', applicationRouter)
v1Router.use('/documents', documentRouter)
v1Router.use('/account-documents', accountDocumentRouter)
v1Router.use('/outlets',outletRouter)
v1Router.use('/cities',cityRouter)
v1Router.use('/payouts',payoutRouter)
v1Router.use('/profile',profileRouter)
/*
 * The menu API is owned by the meals module; the vendor module keeps what is
 * genuinely its own at this mount: the ACTIVE authoring gate (a vendor builds
 * their menu while banking is still being verified — authoring, not go-live),
 * and its offer preview, composed onto every dish response. Offers stay a
 * vendor concern until pricing (Phase 6) settles their home.
 */
v1Router.use('/menu', requireVendorState("ACTIVE"), createMealsVendorRouter({ offerPreview: getDiscountsForMenuItems }))
//* Merchant-funded offers. Authoring tier, like the menu.
v1Router.use('/discounts', discountRouter)

// Vendor module info endpoint (optional)
v1Router.get('/', (req: Request, res: Response) => {
  res.json({
    module: 'vendor',
    version: 'v1',
    endpoints: {
      applications: {
        GET: '/applications',
        POST: '/applications',
        submit: 'POST /applications/submit'
      },
      documents: {
        POST: '/documents',
        DELETE: '/documents/:id'
      },
      outlets: {
        GET: '/outlets',
        POST: '/outlets'
      }
    }
  })
})

// V1 vendor health check
v1Router.get('/health', (req: Request, res: Response) => {
  res.json({
    module: 'vendor',
    version: 'v1',
    status: 'healthy',
    timestamp: new Date().toISOString()
  })
})

export default v1Router