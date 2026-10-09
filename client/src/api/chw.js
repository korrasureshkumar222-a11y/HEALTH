import { apiClient } from './client.js'

function responseData(response) {
  return response.data?.data ?? response.data
}

export async function getChwDashboard() {
  return responseData(await apiClient.get('/dashboard/chw'))
}

export async function getChwPerformance(params = {}) {
  return responseData(await apiClient.get('/dashboard/chw/performance', { params }))
}

export async function listChwVisits(params = {}) {
  return responseData(await apiClient.get('/chw/visits', { params }))
}

export async function createChwVisit(input) {
  return responseData(await apiClient.post('/chw/visits', input))
}

export async function updateChwVisit(visitId, input) {
  return responseData(await apiClient.patch(`/chw/visits/${visitId}`, input))
}
