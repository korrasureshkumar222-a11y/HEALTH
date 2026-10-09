import { Router } from 'express'
import { adminReports, adminReportsCsv, patientSummaryPdf, patientSummaryReport, readingsCsvReport } from '../controllers/reportController.js'
import authorize, { authorizePatient } from '../middleware/authorize.js'
import protect from '../middleware/auth.js'
import validateRequest from '../middleware/validateRequest.js'
import asyncHandler from '../utils/asyncHandler.js'
import auditSensitiveAction from '../middleware/auditSensitiveAction.js'
import { emptyParamsSchema, patientIdParamsSchema } from '../validators/securityValidators.js'
import { readingExportSchema, reportPdfSchema, reportRangeSchema } from '../validators/reportValidators.js'

const router = Router()
router.use(protect)
router.get('/patients/:patientId/summary.pdf', authorize('patient', 'doctor', 'chw', 'admin'), validateRequest(patientIdParamsSchema, 'params'), authorizePatient(), validateRequest(reportPdfSchema, 'query'), asyncHandler(patientSummaryPdf))
router.get('/patients/:patientId/summary', authorize('patient', 'doctor', 'chw', 'admin'), validateRequest(patientIdParamsSchema, 'params'), authorizePatient(), validateRequest(reportRangeSchema, 'query'), auditSensitiveAction({ action: 'data.view', resourceType: 'Patient', resourceIdParam: 'patientId', reason: 'Patient summary report viewed.' }), asyncHandler(patientSummaryReport))
router.get('/patients/:patientId/readings.csv', authorize('patient', 'doctor', 'chw', 'admin'), validateRequest(patientIdParamsSchema, 'params'), authorizePatient(), validateRequest(readingExportSchema, 'query'), asyncHandler(readingsCsvReport))
router.get('/admin', authorize('admin'), validateRequest(emptyParamsSchema, 'params'), validateRequest(reportRangeSchema, 'query'), auditSensitiveAction({ action: 'data.view', reason: 'Admin reports viewed.' }), asyncHandler(adminReports))
router.get('/admin.csv', authorize('admin'), validateRequest(emptyParamsSchema, 'params'), validateRequest(reportRangeSchema, 'query'), asyncHandler(adminReportsCsv))

export default router
