import { Router } from 'express'
import { getSos, patchSosStatus, postSos } from '../controllers/sosController.js'
import protect from '../middleware/auth.js'
import authorize from '../middleware/authorize.js'
import validateRequest from '../middleware/validateRequest.js'
import asyncHandler from '../utils/asyncHandler.js'
import auditSensitiveAction from '../middleware/auditSensitiveAction.js'
import { emptyParamsSchema, emptyQuerySchema } from '../validators/securityValidators.js'
import {
  createSosSchema,
  sosParamsSchema,
  updateSosStatusSchema,
} from '../validators/sosValidators.js'

const router = Router()

router.post(
  '/',
  protect,
  authorize('patient', 'chw'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(createSosSchema),
  asyncHandler(postSos),
)
router.get(
  '/:incidentId',
  protect,
  authorize('patient', 'doctor', 'chw', 'admin'),
  validateRequest(sosParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', resourceType: 'SosIncident', resourceIdParam: 'incidentId' }),
  asyncHandler(getSos),
)
router.patch(
  '/:incidentId/status',
  protect,
  authorize('doctor', 'chw', 'admin'),
  validateRequest(sosParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(updateSosStatusSchema),
  asyncHandler(patchSosStatus),
)

export default router
