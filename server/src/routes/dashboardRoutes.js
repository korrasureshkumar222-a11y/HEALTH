import { Router } from 'express'
import authorize from '../middleware/authorize.js'
import protect from '../middleware/auth.js'
import asyncHandler from '../utils/asyncHandler.js'
import {
  getChwDashboardData,
  getChwPerformanceData,
  getDoctorDashboardData,
  getPatientDashboardData,
} from '../controllers/dashboardController.js'
import validateRequest from '../middleware/validateRequest.js'
import { doctorDashboardQuerySchema } from '../validators/dashboardValidators.js'
import { performanceQuerySchema } from '../validators/chwValidators.js'
import auditSensitiveAction from '../middleware/auditSensitiveAction.js'
import { emptyParamsSchema, emptyQuerySchema } from '../validators/securityValidators.js'

const router = Router()

router.get('/chw', protect, authorize('chw'), validateRequest(emptyParamsSchema, 'params'), validateRequest(emptyQuerySchema, 'query'), auditSensitiveAction({ action: 'data.view', reason: 'CHW dashboard viewed.' }), asyncHandler(getChwDashboardData))
router.get(
  '/chw/performance',
  protect,
  authorize('chw'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(performanceQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', reason: 'CHW performance dashboard viewed.' }),
  asyncHandler(getChwPerformanceData),
)

router.get(
  '/doctor',
  protect,
  authorize('doctor'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(doctorDashboardQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', reason: 'Doctor dashboard viewed.' }),
  asyncHandler(getDoctorDashboardData),
)

router.get(
  '/patient',
  protect,
  authorize('patient'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', reason: 'Patient dashboard viewed.' }),
  asyncHandler(getPatientDashboardData),
)

export default router
