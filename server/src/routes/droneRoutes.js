import { Router } from 'express'
import {
  abortMission,
  approveMission,
  deleteLandingPoint,
  getLandingPointDetails,
  getLandingPoints,
  getMission,
  getMissions,
  patchLandingPoint,
  patchLandingChecklist,
  postLandingPoint,
  postMission,
  patchMissionStatus,
} from '../controllers/droneController.js'
import protect from '../middleware/auth.js'
import authorize from '../middleware/authorize.js'
import validateRequest from '../middleware/validateRequest.js'
import asyncHandler from '../utils/asyncHandler.js'
import auditSensitiveAction from '../middleware/auditSensitiveAction.js'
import { emptyBodySchema, emptyParamsSchema, emptyQuerySchema } from '../validators/securityValidators.js'
import {
  abortDroneMissionSchema,
  createDroneMissionSchema,
  createLandingPointSchema,
  droneMissionListQuerySchema,
  updateDroneMissionStatusSchema,
  droneMissionIdSchema,
  landingPointIdSchema,
  landingPointListQuerySchema,
  updateLandingChecklistSchema,
  updateLandingPointSchema,
} from '../validators/droneValidators.js'

const router = Router()

router.get(
  '/landing-points',
  protect,
  authorize('admin', 'chw'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(landingPointListQuerySchema, 'query'),
  asyncHandler(getLandingPoints),
)
router.post(
  '/landing-points',
  protect,
  authorize('admin', 'chw'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(createLandingPointSchema),
  asyncHandler(postLandingPoint),
)
router.get(
  '/landing-points/:landingPointId',
  protect,
  authorize('admin', 'chw'),
  validateRequest(landingPointIdSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  asyncHandler(getLandingPointDetails),
)
router.patch(
  '/landing-points/:landingPointId/checklist',
  protect,
  authorize('chw'),
  validateRequest(landingPointIdSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(updateLandingChecklistSchema),
  asyncHandler(patchLandingChecklist),
)
router.patch(
  '/landing-points/:landingPointId',
  protect,
  authorize('admin'),
  validateRequest(landingPointIdSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(updateLandingPointSchema),
  asyncHandler(patchLandingPoint),
)
router.delete(
  '/landing-points/:landingPointId',
  protect,
  authorize('admin'),
  validateRequest(landingPointIdSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  asyncHandler(deleteLandingPoint),
)
router.get(
  '/missions',
  protect,
  authorize('patient', 'doctor', 'chw', 'admin'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(droneMissionListQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', reason: 'Drone mission list viewed.' }),
  asyncHandler(getMissions),
)
router.post(
  '/missions',
  protect,
  authorize('patient', 'doctor', 'chw', 'admin'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(createDroneMissionSchema),
  asyncHandler(postMission),
)
router.get(
  '/missions/:missionId',
  protect,
  authorize('patient', 'doctor', 'chw', 'admin'),
  validateRequest(droneMissionIdSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', resourceType: 'DroneMission', resourceIdParam: 'missionId' }),
  asyncHandler(getMission),
)
router.post(
  '/missions/:missionId/approve',
  protect,
  authorize('doctor', 'admin'),
  validateRequest(droneMissionIdSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(emptyBodySchema),
  asyncHandler(approveMission),
)
router.post(
  '/missions/:missionId/abort',
  protect,
  authorize('doctor', 'admin'),
  validateRequest(droneMissionIdSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(abortDroneMissionSchema),
  asyncHandler(abortMission),
)
router.patch(
  '/missions/:missionId/status',
  protect,
  authorize('doctor', 'admin'),
  validateRequest(droneMissionIdSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(updateDroneMissionStatusSchema),
  asyncHandler(patchMissionStatus),
)

export default router
