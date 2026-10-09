import { apiClient } from './client.js'

function responseData(response) {
  return response.data?.data ?? response.data
}

export async function getAlerts(params = {}) {
  const query = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null),
  )
  return responseData(await apiClient.get('/alerts', { params: query }))
}

export async function acknowledgeAlert(alertId, note) {
  return responseData(await apiClient.patch(`/alerts/${alertId}/acknowledge`, { note }))
}

export async function resolveAlert(alertId, resolutionNote) {
  return responseData(await apiClient.patch(`/alerts/${alertId}/resolve`, { resolutionNote }))
}
