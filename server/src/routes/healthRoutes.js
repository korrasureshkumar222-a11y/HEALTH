import { Router } from 'express'
import validateRequest from '../middleware/validateRequest.js'
import { emptyParamsSchema, emptyQuerySchema } from '../validators/securityValidators.js'

const router = Router()

router.get('/', validateRequest(emptyParamsSchema, 'params'), validateRequest(emptyQuerySchema, 'query'), (_request, response) => {
  response.status(200).json({
    success: true,
    message: 'Service is healthy.',
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
  })
})

export default router
