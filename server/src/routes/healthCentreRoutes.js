import { Router } from 'express'
import {
  deleteHealthCentre,
  getHealthCentreById,
  getHealthCentres,
  getBookableHealthCentres,
  getNearestHealthCentres,
  patchHealthCentre,
  postHealthCentre,
} from '../controllers/healthCentreController.js'
import protect from '../middleware/auth.js'
import authorize from '../middleware/authorize.js'
import validateRequest from '../middleware/validateRequest.js'
import asyncHandler from '../utils/asyncHandler.js'
import { emptyParamsSchema, emptyQuerySchema } from '../validators/securityValidators.js'
import {
  createHealthCentreSchema,
  healthCentreIdSchema,
  healthCentreListQuerySchema,
  nearestHealthCentresQuerySchema,
  updateHealthCentreSchema,
} from '../validators/healthCentreValidators.js'

const router = Router()

router.get(
  '/nearest',
  protect,
  authorize('patient', 'doctor', 'chw', 'admin'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(nearestHealthCentresQuerySchema, 'query'),
  asyncHandler(getNearestHealthCentres),
)
router.get(
  '/active',
  protect,
  authorize('patient', 'doctor', 'chw', 'admin'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  asyncHandler(getBookableHealthCentres),
)
router.get(
  '/',
  protect,
  authorize('admin'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(healthCentreListQuerySchema, 'query'),
  asyncHandler(getHealthCentres),
)
router.post(
  '/',
  protect,
  authorize('admin'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(createHealthCentreSchema),
  asyncHandler(postHealthCentre),
)
router.get(
  '/:centreId',
  protect,
  authorize('admin'),
  validateRequest(healthCentreIdSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  asyncHandler(getHealthCentreById),
)
router.patch(
  '/:centreId',
  protect,
  authorize('admin'),
  validateRequest(healthCentreIdSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(updateHealthCentreSchema),
  asyncHandler(patchHealthCentre),
)
router.delete(
  '/:centreId',
  protect,
  authorize('admin'),
  validateRequest(healthCentreIdSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  asyncHandler(deleteHealthCentre),
)

export default router
