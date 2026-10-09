import { apiClient } from './client.js'
import { cachePatient } from '../offline/patientCache.js'

function responseData(response) {
  return response.data?.data ?? response.data
}

export async function listPatients(params = {}) {
  const query = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null),
  )
  return responseData(await apiClient.get('/patients', { params: query }))
}

export async function getPatient(patientId, userId) {
  const result = responseData(await apiClient.get(`/patients/${patientId}`))
  await cachePatient(userId, result.patient)
  return result
}

export async function getOwnPatient() {
  return responseData(await apiClient.get('/patients/me'))
}

export async function createPatient(input) {
  return responseData(await apiClient.post('/patients', input))
}

export async function updatePatient(patientId, input) {
  return responseData(await apiClient.patch(`/patients/${patientId}`, input))
}

export async function getAssignableStaff() {
  return responseData(await apiClient.get('/patients/assignables'))
}

export async function updatePatientAssignments(patientId, assignments) {
  return responseData(await apiClient.patch(`/patients/${patientId}/assignments`, assignments))
}

export async function deactivatePatient(patientId) {
  return responseData(await apiClient.post(`/patients/${patientId}/deactivate`))
}

export async function getPatientReadings(patientId, params = {}) {
  return responseData(await apiClient.get(`/readings/${patientId}`, { params }))
}

export async function getPatientReadingSeries(patientId, params) {
  return responseData(await apiClient.get(`/readings/${patientId}/series`, { params }))
}

export async function getPatientNotes(patientId, params = {}) {
  return responseData(await apiClient.get(`/patients/${patientId}/notes`, { params }))
}

export async function addPatientNote(patientId, input) {
  return responseData(await apiClient.post(`/patients/${patientId}/notes`, input))
}

export async function getPatientMedications(patientId) {
  return responseData(await apiClient.get(`/patients/${patientId}/medications`))
}

export async function prescribeMedication(patientId, input) {
  return responseData(await apiClient.post(`/patients/${patientId}/medications`, input))
}

export async function updatePrescription(patientId, medicationId, input) {
  return responseData(await apiClient.patch(`/patients/${patientId}/medications/${medicationId}`, input))
}

export async function getPatientAppointments(patientId) {
  return responseData(await apiClient.get(`/patients/${patientId}/appointments`))
}

export async function schedulePatientAppointment(patientId, input) {
  return responseData(await apiClient.post(`/patients/${patientId}/appointments`, input))
}

export async function getPatientTimeline(patientId) {
  return responseData(await apiClient.get(`/patients/${patientId}/timeline`))
}
