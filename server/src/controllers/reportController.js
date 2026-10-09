import { getAdminReports, getPatientSummary, getReadingCsv } from '../services/reportService.js'
import { createPatientSummaryPdf } from '../services/reportPdfService.js'
import AuditLog from '../models/AuditLog.js'

export async function patientSummaryReport(request, response) {
  const report = await getPatientSummary(request.params.patientId, request.query)
  response.status(200).json({ success: true, message: 'Patient report generated.', data: report })
}

export async function patientSummaryPdf(request, response) {
  const report = await getPatientSummary(request.params.patientId, request.query)
  const language = request.query.language ?? report.patient.language ?? 'en'
  await AuditLog.create({
    actor: request.user._id,
    actorRole: request.user.role,
    action: 'report.summary.export',
    resourceType: 'Patient',
    resourceId: report.patient._id,
  })
  response.set({
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `attachment; filename="patient-summary-${report.patient._id}.pdf"`,
    'Content-Type': 'application/pdf',
  })
  const document = createPatientSummaryPdf(report, language)
  document.pipe(response)
  document.end()
}

function csvCell(value) {
  let text = value == null ? '' : String(value)
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export async function readingsCsvReport(request, response) {
  const rows = await getReadingCsv(request.params.patientId, request.query)
  await AuditLog.create({
    actor: request.user._id,
    actorRole: request.user.role,
    action: 'report.readings.export',
    resourceType: 'Patient',
    resourceId: request.params.patientId,
  })
  const columns = ['recordedAt', 'type', 'systolic', 'diastolic', 'value', 'unit', 'sugarContext', 'status', 'source', 'notes']
  const csv = [columns.join(','), ...rows.map((row) => columns.map((column) => csvCell(
    column === 'recordedAt' ? row.recordedAt?.toISOString()
      : ['systolic', 'diastolic', 'value', 'unit', 'sugarContext'].includes(column) ? row.values?.[column]
        : row[column],
  )).join(','))].join('\r\n')
  response.status(200).type('text/csv; charset=utf-8')
    .set('Cache-Control', 'private, no-store')
    .set('Content-Disposition', `attachment; filename="readings-${request.params.patientId}.csv"`)
    .send(`\uFEFF${csv}`)
}

export async function adminReports(request, response) {
  const report = await getAdminReports(request.query)
  response.status(200).json({ success: true, message: 'Admin reports generated.', data: report })
}

export async function adminReportsCsv(request, response) {
  const report = await getAdminReports(request.query)
  await AuditLog.create({
    actor: request.user._id,
    actorRole: request.user.role,
    action: 'report.admin.export',
    resourceType: 'SystemReport',
    reason: `Admin report CSV exported (${request.query.from ?? 'unbounded'} to ${request.query.to ?? 'unbounded'}).`,
  })
  const rows = [
    ['section', 'period', 'district', 'mandal', 'village', 'name', 'count', 'completed', 'missed', 'status', 'responseMinutes'],
    ...report.patientsPerVillage.map((row) => [
      'patients_per_village', '', row._id.district, row._id.mandal, row._id.village, '', row.patients,
    ]),
    ...report.criticalAlertsPerWeek.map((row) => [
      'critical_alerts_per_week', row.weekStarting?.toISOString(), '', '', '', '', row.count,
    ]),
    ...report.chwActivity.map((row) => [
      'chw_activity', '', '', '', '', row.name ?? row.employeeId, row.visits, row.completed, row.missed,
    ]),
    ...report.sosResponse.incidents.map((row) => [
      'sos_response', row.createdAt?.toISOString(), '', '', '', '', '', '', '', row.status, row.responseMinutes,
    ]),
    ...report.droneMissions.items.map((row) => [
      'drone_mission', row.createdAt?.toISOString(), '', '', '', '', '', '', '', row.status,
    ]),
  ]
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
  response.status(200).type('text/csv; charset=utf-8')
    .set('Cache-Control', 'private, no-store')
    .set('Content-Disposition', 'attachment; filename="admin-health-reports.csv"')
    .send(`\uFEFF${csv}`)
}
