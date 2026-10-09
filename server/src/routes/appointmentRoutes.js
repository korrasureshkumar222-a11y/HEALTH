import { Router } from 'express'
import { z } from 'zod'
import auditSensitiveAction from '../middleware/auditSensitiveAction.js'
import { emptyBodySchema, emptyParamsSchema, emptyQuerySchema } from '../validators/securityValidators.js'
import authorize from '../middleware/authorize.js'
import protect from '../middleware/auth.js'
import validateRequest from '../middleware/validateRequest.js'
import asyncHandler from '../utils/asyncHandler.js'
import {
  appointmentCreateSchema,
  appointmentIdParamsSchema,
  appointmentListQuerySchema,
  appointmentRescheduleSchema,
  appointmentStatusSchema,
  availabilityQuerySchema,
  doctorAvailabilitySchema,
} from '../validators/careValidators.js'
import {
  confirmAppointment,
  getAppointmentDoctors,
  getAppointments,
  getAvailability,
  getMyAvailability,
  patchCancel,
  patchReschedule,
  postAppointment,
  putDoctorAvailability,
  updateAppointment,
} from '../controllers/appointmentController.js'

const router = Router()
const appointmentRoles = authorize('patient', 'doctor', 'chw', 'admin')

router.use(protect)
router.get('/doctors', appointmentRoles, validateRequest(emptyParamsSchema, 'params'), validateRequest(emptyQuerySchema, 'query'), asyncHandler(getAppointmentDoctors))
router.get(
  '/availability',
  appointmentRoles,
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(availabilityQuerySchema, 'query'),
  asyncHandler(getAvailability),
)
router.put(
  '/availability',
  authorize('doctor'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(doctorAvailabilitySchema),
  asyncHandler(putDoctorAvailability),
)
router.get('/availability/mine', authorize('doctor'), validateRequest(emptyParamsSchema, 'params'), validateRequest(emptyQuerySchema, 'query'), asyncHandler(getMyAvailability))
router.get(
  '/',
  appointmentRoles,
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(appointmentListQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', reason: 'Appointment list viewed.' }),
  asyncHandler(getAppointments),
)
router.post(
  '/',
  appointmentRoles,
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(appointmentCreateSchema),
  asyncHandler(postAppointment),
)
router.patch(
  '/:appointmentId/confirm',
  authorize('doctor', 'admin'),
  validateRequest(appointmentIdParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(emptyBodySchema),
  asyncHandler(confirmAppointment),
)
router.patch(
  '/:appointmentId/reschedule',
  appointmentRoles,
  validateRequest(appointmentIdParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(appointmentRescheduleSchema),
  asyncHandler(patchReschedule),
)
router.patch(
  '/:appointmentId/cancel',
  appointmentRoles,
  validateRequest(appointmentIdParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(z.object({
    reason: z.string().trim().max(500).optional(),
  }).strict()),
  asyncHandler(patchCancel),
)
router.patch(
  '/:appointmentId/status',
  authorize('doctor', 'admin'),
  validateRequest(appointmentIdParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(appointmentStatusSchema),
  asyncHandler(updateAppointment),
)

export default router
