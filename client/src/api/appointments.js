import { apiClient } from './client.js'

function responseData(response) {
  return response.data?.data ?? response.data
}

export async function getAppointmentDoctors() {
  return responseData(await apiClient.get('/appointments/doctors'))
}

export async function getAppointmentAvailability(params) {
  return responseData(await apiClient.get('/appointments/availability', { params }))
}

export async function getMyAvailability() {
  return responseData(await apiClient.get('/appointments/availability/mine'))
}

export async function updateMyAvailability(availability) {
  return responseData(await apiClient.put('/appointments/availability', { availability }))
}

export async function listAppointments(params = {}) {
  return responseData(await apiClient.get('/appointments', { params }))
}

export async function createAppointment(input) {
  return responseData(await apiClient.post('/appointments', input))
}

export async function confirmAppointment(appointmentId) {
  return responseData(await apiClient.patch(`/appointments/${appointmentId}/confirm`, {}))
}

export async function rescheduleAppointment(appointmentId, input) {
  return responseData(await apiClient.patch(`/appointments/${appointmentId}/reschedule`, input))
}

export async function cancelAppointment(appointmentId, reason) {
  return responseData(await apiClient.patch(`/appointments/${appointmentId}/cancel`, { reason }))
}

export async function setAppointmentStatus(appointmentId, input) {
  return responseData(await apiClient.patch(`/appointments/${appointmentId}/status`, input))
}
