import { Router } from 'express'
import protect from '../middleware/auth.js'
import validateRequest from '../middleware/validateRequest.js'
import asyncHandler from '../utils/asyncHandler.js'
import { syncBatchSchema } from '../validators/syncValidators.js'
import { postSync } from '../controllers/syncController.js'
import { emptyParamsSchema, emptyQuerySchema } from '../validators/securityValidators.js'

const router = Router()

router.post(
  '/',
  protect,
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(syncBatchSchema),
  asyncHandler(postSync),
)

export default router
