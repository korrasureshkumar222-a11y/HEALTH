import { apiClient } from './client.js'

function responseData(response) {
  return response.data?.data ?? response.data
}

export async function getNearestHealthCentres(params) {
  const result = responseData(await apiClient.get('/health-centres/nearest', { params }))
  return result.items
}

export async function getBookableHealthCentres() {
  const result = responseData(await apiClient.get('/health-centres/active'))
  return result.items
}
