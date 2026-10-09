import { apiClient } from './client.js'

function responseData(response) {
  return response.data?.data ?? response.data
}

export async function listLandingPoints(params = {}) {
  return responseData(await apiClient.get('/drone/landing-points', { params }))
}

export async function getLandingPoint(landingPointId) {
  return responseData(await apiClient.get(`/drone/landing-points/${landingPointId}`))
}

export async function createLandingPoint(input) {
  return responseData(await apiClient.post('/drone/landing-points', input))
}

export async function updateLandingPoint(landingPointId, input) {
  return responseData(await apiClient.patch(`/drone/landing-points/${landingPointId}`, input))
}

export async function updateLandingChecklist(landingPointId, checklist) {
  return responseData(await apiClient.patch(`/drone/landing-points/${landingPointId}/checklist`, { checklist }))
}

export async function listDroneMissions(params = {}) {
  return responseData(await apiClient.get('/drone/missions', { params }))
}

export async function requestDroneMission(input) {
  return responseData(await apiClient.post('/drone/missions', input))
}

export async function approveDroneMission(missionId) {
  return responseData(await apiClient.post(`/drone/missions/${missionId}/approve`))
}

export async function abortDroneMission(missionId, reason) {
  return responseData(await apiClient.post(`/drone/missions/${missionId}/abort`, { reason }))
}

export async function updateDroneMissionStatus(missionId, input) {
  return responseData(await apiClient.patch(`/drone/missions/${missionId}/status`, input))
}
