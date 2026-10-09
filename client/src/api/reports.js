import { apiClient } from './client.js'

function responseData(response) {
  return response.data?.data ?? response.data
}

export async function getPatientSummaryReport(patientId, params = {}) {
  return responseData(await apiClient.get(`/reports/patients/${patientId}/summary`, { params }))
}

export async function downloadPatientSummaryPdf(patientId, params = {}) {
  const response = await apiClient.get(`/reports/patients/${patientId}/summary.pdf`, {
    params,
    responseType: 'blob',
  })
  return response.data
}

export async function downloadReadingsCsv(patientId, params = {}) {
  const response = await apiClient.get(`/reports/patients/${patientId}/readings.csv`, {
    params,
    responseType: 'blob',
  })
  return response.data
}

export async function getAdminReports(params = {}) {
  return responseData(await apiClient.get('/reports/admin', { params }))
}

export async function downloadAdminReportsCsv(params = {}) {
  const response = await apiClient.get('/reports/admin.csv', {
    params,
    responseType: 'blob',
  })
  return response.data
}
