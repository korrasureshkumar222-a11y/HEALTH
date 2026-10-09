import { apiClient } from './client.js'

function responseData(response) {
  return response.data?.data ?? response.data
}

export async function createReading(input) {
  return responseData(await apiClient.post('/readings', input))
}

export async function submitReadingsBatch(items) {
  return responseData(await apiClient.post('/readings/bulk', {
    items,
    batchId: crypto.randomUUID(),
  }))
}

export async function listMyReadings(params = {}) {
  const profileResponse = await apiClient.get('/patients/me')
  const patient = responseData(profileResponse).patient
  const query = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null),
  )
  const readingsResponse = await apiClient.get(`/readings/${patient._id}`, { params: query })
  return {
    ...responseData(readingsResponse),
    patientId: patient._id,
  }
}

export async function getMyReadingSeries(params) {
  const profileResponse = await apiClient.get('/patients/me')
  const patient = responseData(profileResponse).patient
  return responseData(await apiClient.get(`/readings/${patient._id}/series`, { params }))
}
