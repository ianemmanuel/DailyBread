import { Router } from 'express'
import vendorRoutes from '../modules/vendor/routes'
import metaRoutes from '@/modules/meta/routes'
import { vendorAuthChain } from '@/modules/vendor/middlewares'
import adminRoutes from '../modules/admin/routes'
import { customerRouter } from '@/modules/customer'
const router: Router = Router()


// vendorAuthChain (verifyVendorToken + loadVendorContext) is the sole
// vendor auth path — it already asserts app === "vendor" internally,
// making requireApp("vendor") redundant here, and it resolves
// req.vendor (incl. isDeleted/isActive/isBanned) so every vendor route
// sees current DB state on every request, not just identity.
router.use(
  '/vendor',
  ...vendorAuthChain,
  vendorRoutes
)
// /meta is vendor-app-scoped (onboarding country/vendor-type lookups)
// and its controllers call getVendorUser(req), which now resolves off
// req.vendor — so it needs the same chain as /vendor, not the old
// clerkAuthMiddleware+requireApp pair.
router.use(
  '/meta',
  ...vendorAuthChain,
  metaRoutes
)
router.use("/admin", adminRoutes)

// The customer module applies its own auth per sub-router rather than one chain
// here, because most of it is deliberately PUBLIC — browsing, storefronts and
// cart pricing all work signed-out, and only the account half requires an
// identity. Mounting a required chain at this level and exempting routes below
// it is the shape that eventually leaks.
router.use('/customer', customerRouter)


router.get('/', (req, res) => {
  res.json({
    service: 'backend-service',
    description: 'DinnerPlate Backend API',
    versions: ['v1'],
    modules: {
      vendor: '/vendors',
      admin: '/admin',
      customer: '/customers'
    },
    health: '/health',
    info: '/info'
  })
})

//* Real liveness/readiness checks live at /health and /ready
//* (see src/routes/health.ts, mounted directly on the app — not
//* nested under /api). Removed the old /health here to avoid two
//* endpoints named /health with different meanings.

//* Service info
router.get('/info', (req, res) => {
  res.json({
    service: 'backend-service',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  })
})

export default router