import { Router } from 'express'
import { getVisits, patchVisit, postVisit } from '../controllers/chwController.js'
import protect from '../middleware/auth.js'
import authorize from '../middleware/authorize.js'
import validateRequest from '../middleware/validateRequest.js'
import asyncHandler from '../utils/asyncHandler.js'
import auditSensitiveAction from '../middleware/auditSensitiveAction.js'
import { emptyParamsSchema, emptyQuerySchema } from '../validators/securityValidators.js'
import {
  createVisitSchema,
  updateVisitSchema,
  visitParamsSchema,
  visitQuerySchema,
} from '../validators/chwValidators.js'

const router = Router()
router.use(protect, authorize('chw'))

router.get('/visits', validateRequest(emptyParamsSchema, 'params'), validateRequest(visitQuerySchema, 'query'), auditSensitiveAction({ action: 'data.view', reason: 'CHW visit list viewed.' }), asyncHandler(getVisits))
router.post('/visits', validateRequest(emptyParamsSchema, 'params'), validateRequest(emptyQuerySchema, 'query'), validateRequest(createVisitSchema), asyncHandler(postVisit))
router.patch(
  '/visits/:visitId',
  validateRequest(visitParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(updateVisitSchema),
  asyncHandler(patchVisit),
)

export default router
