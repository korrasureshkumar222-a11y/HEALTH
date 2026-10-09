import { apiClient } from './client.js'

function responseData(response) {
  return response.data?.data ?? response.data
}

export async function createSos(input) {
  return responseData(await apiClient.post('/sos', input))
}

export async function getSosIncident(incidentId) {
  return responseData(await apiClient.get(`/sos/${incidentId}`))
}

export async function updateSosStatus(incidentId, input) {
  return responseData(await apiClient.patch(`/sos/${incidentId}/status`, input))
}
