import { Router } from 'express'
import {
  getAlertById,
  getAlerts,
  postAcknowledgeAlert,
  postResolveAlert,
} from '../controllers/alertController.js'
import protect from '../middleware/auth.js'
import authorize from '../middleware/authorize.js'
import validateRequest from '../middleware/validateRequest.js'
import asyncHandler from '../utils/asyncHandler.js'
import auditSensitiveAction from '../middleware/auditSensitiveAction.js'
import { emptyParamsSchema, emptyQuerySchema } from '../validators/securityValidators.js'
import {
  acknowledgeAlertSchema,
  alertListQuerySchema,
  alertParamsSchema,
  resolveAlertSchema,
} from '../validators/alertValidators.js'

const router = Router()
const alertRoles = authorize('patient', 'doctor', 'chw', 'admin')

router.get(
  '/',
  protect,
  alertRoles,
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(alertListQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', reason: 'Alert list viewed.' }),
  asyncHandler(getAlerts),
)
router.get(
  '/:alertId',
  protect,
  alertRoles,
  validateRequest(alertParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', resourceType: 'Alert', resourceIdParam: 'alertId' }),
  asyncHandler(getAlertById),
)
router.patch(
  '/:alertId/acknowledge',
  protect,
  authorize('doctor', 'chw', 'admin'),
  validateRequest(alertParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(acknowledgeAlertSchema),
  asyncHandler(postAcknowledgeAlert),
)
router.patch(
  '/:alertId/resolve',
  protect,
  authorize('doctor', 'admin'),
  validateRequest(alertParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(resolveAlertSchema),
  asyncHandler(postResolveAlert),
)

export default router
