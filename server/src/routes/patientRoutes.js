import { Router } from 'express'
import authorize, { authorizePatient } from '../middleware/authorize.js'
import protect from '../middleware/auth.js'
import asyncHandler from '../utils/asyncHandler.js'
import auditSensitiveAction from '../middleware/auditSensitiveAction.js'
import {
  emptyBodySchema,
  emptyParamsSchema,
  emptyQuerySchema,
  patientAndRecordParamsSchema,
  patientIdParamsSchema,
} from '../validators/securityValidators.js'
import {
  assignPatientRecord,
  createReadingBatch,
  createReadingRecord,
  createPatientRecord,
  deactivatePatientRecord,
  getAssignableStaff,
  getPatient,
  getOwnPatient,
  getPatientReading,
  getPatientReadingSeries,
  getPatientReadings,
  listPatientRecords,
  updatePatientRecord,
  deleteReadingRecord,
} from '../controllers/patientController.js'
import validateRequest from '../middleware/validateRequest.js'
import {
  assignPatientSchema,
  patientListQuerySchema,
  patientProfileSchema,
  updatePatientSchema,
} from '../validators/patientValidators.js'
import {
  readingListQuerySchema,
  readingSeriesQuerySchema,
  bulkReadingsSchema,
  createReadingSchema,
  deleteReadingSchema,
} from '../validators/readingValidators.js'
import {
  appointmentListQuerySchema,
  createAppointmentSchema,
  createMedicationSchema,
  createNoteSchema,
  medicationListQuerySchema,
  noteListQuerySchema,
  patientMedicationParamsSchema,
  patientNoteParamsSchema,
  updateMedicationSchema,
  updateNoteSchema,
} from '../validators/careValidators.js'
import {
  getAppointments,
  getMedications,
  getNotes,
  getTimeline,
  patchMedication,
  patchNote,
  postAppointment,
  postMedication,
  postNote,
} from '../controllers/careController.js'

const router = Router()
const patientRoles = authorize('patient', 'doctor', 'chw', 'admin')

router.get(
  '/patients/assignables',
  protect,
  authorize('admin'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  asyncHandler(getAssignableStaff),
)
router.get(
  '/patients',
  protect,
  authorize('doctor', 'chw', 'admin'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(patientListQuerySchema, 'query'),
  auditSensitiveAction({ action: 'patient.list.view', reason: 'Patient list viewed.' }),
  asyncHandler(listPatientRecords),
)
router.post(
  '/patients',
  protect,
  authorize('chw', 'admin'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(patientProfileSchema),
  asyncHandler(createPatientRecord),
)
router.get(
  '/patients/me',
  protect,
  authorize('patient'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', resourceType: 'SystemReport', reason: 'Own patient profile viewed.' }),
  asyncHandler(getOwnPatient),
)
router.patch(
  '/patients/:patientId/assignments',
  protect,
  authorize('admin'),
  validateRequest(patientIdParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(assignPatientSchema),
  asyncHandler(assignPatientRecord),
)
router.post(
  '/patients/:patientId/deactivate',
  protect,
  authorize('admin'),
  validateRequest(patientIdParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(emptyBodySchema),
  asyncHandler(deactivatePatientRecord),
)
router.patch(
  '/patients/:patientId',
  protect,
  patientRoles,
  validateRequest(patientIdParamsSchema, 'params'),
  authorizePatient(),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(updatePatientSchema),
  asyncHandler(updatePatientRecord),
)
router.get(
  '/patients/:patientId',
  protect,
  patientRoles,
  validateRequest(patientIdParamsSchema, 'params'),
  authorizePatient(),
  validateRequest(emptyQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', resourceType: 'Patient', resourceIdParam: 'patientId' }),
  asyncHandler(getPatient),
)
router.get(
  '/patients/:patientId/timeline',
  protect,
  patientRoles,
  validateRequest(patientIdParamsSchema, 'params'),
  authorizePatient(),
  validateRequest(emptyQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', resourceType: 'Patient', resourceIdParam: 'patientId', reason: 'Patient timeline viewed.' }),
  asyncHandler(getTimeline),
)
router.get(
  '/patients/:patientId/notes',
  protect,
  patientRoles,
  validateRequest(patientIdParamsSchema, 'params'),
  authorizePatient(),
  validateRequest(noteListQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', resourceType: 'Patient', resourceIdParam: 'patientId', reason: 'Patient notes viewed.' }),
  asyncHandler(getNotes),
)
router.post(
  '/patients/:patientId/notes',
  protect,
  authorize('doctor', 'chw'),
  validateRequest(patientIdParamsSchema, 'params'),
  authorizePatient(),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(createNoteSchema),
  asyncHandler(postNote),
)
router.patch(
  '/patients/:patientId/notes/:noteId',
  protect,
  authorize('doctor', 'chw'),
  validateRequest(patientNoteParamsSchema, 'params'),
  authorizePatient(),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(updateNoteSchema),
  asyncHandler(patchNote),
)
router.get(
  '/patients/:patientId/medications',
  protect,
  patientRoles,
  validateRequest(patientIdParamsSchema, 'params'),
  authorizePatient(),
  validateRequest(medicationListQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', resourceType: 'Patient', resourceIdParam: 'patientId', reason: 'Patient medications viewed.' }),
  asyncHandler(getMedications),
)
router.post(
  '/patients/:patientId/medications',
  protect,
  authorize('doctor'),
  validateRequest(patientIdParamsSchema, 'params'),
  authorizePatient(),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(createMedicationSchema),
  asyncHandler(postMedication),
)
router.patch(
  '/patients/:patientId/medications/:medicationId',
  protect,
  authorize('doctor'),
  validateRequest(patientMedicationParamsSchema, 'params'),
  authorizePatient(),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(updateMedicationSchema),
  asyncHandler(patchMedication),
)
router.get(
  '/patients/:patientId/appointments',
  protect,
  patientRoles,
  validateRequest(patientIdParamsSchema, 'params'),
  authorizePatient(),
  validateRequest(appointmentListQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', resourceType: 'Patient', resourceIdParam: 'patientId', reason: 'Patient appointments viewed.' }),
  asyncHandler(getAppointments),
)
router.post(
  '/patients/:patientId/appointments',
  protect,
  authorize('doctor'),
  validateRequest(patientIdParamsSchema, 'params'),
  authorizePatient(),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(createAppointmentSchema),
  asyncHandler(postAppointment),
)
router.get(
  '/readings/:patientId/series',
  protect,
  patientRoles,
  validateRequest(patientIdParamsSchema, 'params'),
  authorizePatient(),
  validateRequest(readingSeriesQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', resourceType: 'Patient', resourceIdParam: 'patientId', reason: 'Patient reading series viewed.' }),
  asyncHandler(getPatientReadingSeries),
)
router.get(
  '/readings/:patientId',
  protect,
  patientRoles,
  validateRequest(patientIdParamsSchema, 'params'),
  authorizePatient(),
  validateRequest(readingListQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', resourceType: 'Patient', resourceIdParam: 'patientId', reason: 'Patient readings viewed.' }),
  asyncHandler(getPatientReadings),
)
router.post(
  '/readings',
  protect,
  authorize('patient', 'chw'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(createReadingSchema),
  asyncHandler(createReadingRecord),
)
router.post(
  '/readings/bulk',
  protect,
  authorize('patient', 'chw'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(bulkReadingsSchema),
  asyncHandler(createReadingBatch),
)
router.delete(
  '/readings/:patientId/:recordId',
  protect,
  authorize('admin'),
  validateRequest(patientAndRecordParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(deleteReadingSchema),
  asyncHandler(deleteReadingRecord),
)
router.get(
  '/readings/:patientId/:recordId',
  protect,
  patientRoles,
  validateRequest(patientAndRecordParamsSchema, 'params'),
  authorizePatient(),
  validateRequest(emptyQuerySchema, 'query'),
  auditSensitiveAction({ action: 'data.view', resourceType: 'HealthRecord', resourceIdParam: 'recordId' }),
  asyncHandler(getPatientReading),
)

export default router
