import { apiClient } from './client.js'

export async function getPatientDashboard() {
  const response = await apiClient.get('/dashboard/patient')
  return response.data?.data ?? response.data
}

export async function getDoctorDashboard(params = {}) {
  const response = await apiClient.get('/dashboard/doctor', { params })
  return response.data?.data ?? response.data
}
