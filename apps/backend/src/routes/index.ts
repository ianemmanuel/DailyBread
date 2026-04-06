import { Router } from 'express'
import vendorRoutes from '../modules/vendor/routes'
import metaRoutes from '@/modules/meta/routes'
import { clerkAuthMiddleware, requireApp } from '@/middleware/auth'
import adminRoutes from '../modules/admin/routes'
const router: Router = Router()


router.use(
  '/vendor',
  clerkAuthMiddleware, 
  requireApp("vendor"),
  vendorRoutes
)
router.use(
  '/meta',
  clerkAuthMiddleware, 
  requireApp("vendor"), 
  metaRoutes
)
router.use("/admin", adminRoutes)

// router.use('/customer', customerRoutes)


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

router.get('/health', (req, res) => {
  res.json({
    service: 'backend-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })
})

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