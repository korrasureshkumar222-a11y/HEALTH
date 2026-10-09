import {
  abortDroneMission,
  approveDroneMission,
  getDroneMission,
  listDroneMissions,
  requestDroneMission,
  updateDroneMissionStatus,
} from '../services/droneMissionService.js'
import {
  createLandingPoint,
  deactivateLandingPoint,
  getLandingPoint,
  listLandingPoints,
  updateLandingChecklist,
  updateLandingPoint,
} from '../services/landingPointService.js'

export async function getLandingPoints(request, response) {
  const result = await listLandingPoints(request.user, request.query)
  response.status(200).json({ success: true, message: 'Landing points retrieved.', data: result })
}

export async function postLandingPoint(request, response) {
  const landingPoint = await createLandingPoint(request.user, request.body)
  response.status(201).json({ success: true, message: 'Landing point created and left inactive pending verification.', data: { landingPoint } })
}

export async function getLandingPointDetails(request, response) {
  const landingPoint = await getLandingPoint(request.user, request.params.landingPointId)
  response.status(200).json({ success: true, message: 'Landing-point details retrieved.', data: { landingPoint } })
}

export async function patchLandingPoint(request, response) {
  const landingPoint = await updateLandingPoint(request.user, request.params.landingPointId, request.body)
  response.status(200).json({ success: true, message: 'Landing point updated.', data: { landingPoint } })
}

export async function patchLandingChecklist(request, response) {
  const landingPoint = await updateLandingChecklist(
    request.user,
    request.params.landingPointId,
    request.body.checklist,
  )
  response.status(200).json({ success: true, message: 'Landing-point checklist updated; admin verification is required.', data: { landingPoint } })
}

export async function deleteLandingPoint(request, response) {
  const landingPoint = await deactivateLandingPoint(request.user, request.params.landingPointId)
  response.status(200).json({ success: true, message: 'Landing point deactivated.', data: { landingPoint } })
}

export async function getMissions(request, response) {
  const result = await listDroneMissions(request.user, request.query)
  response.status(200).json({ success: true, message: 'Drone missions retrieved.', data: result })
}

export async function getMission(request, response) {
  const mission = await getDroneMission(request.user, request.params.missionId)
  response.status(200).json({ success: true, message: 'Drone mission retrieved.', data: { mission } })
}

export async function postMission(request, response) {
  const result = await requestDroneMission(request.user, request.body)
  response.status(result.duplicate ? 200 : 201).json({
    success: true,
    message: 'Drone mission requested. A doctor or admin must approve dispatch.',
    data: result,
  })
}

export async function patchMissionStatus(request, response) {
  const mission = await updateDroneMissionStatus(
    request.user,
    request.params.missionId,
    request.body,
  )
  response.status(200).json({ success: true, message: 'Drone mission status updated.', data: { mission } })
}

export async function approveMission(request, response) {
  const result = await approveDroneMission(request.user, request.params.missionId)
  response.status(200).json({
    success: true,
    message: result.provider.simulated
      ? 'Mission approved and simulated by the mock drone provider.'
      : 'Mission approved and dispatched by the configured provider.',
    data: result,
  })
}

export async function abortMission(request, response) {
  const mission = await abortDroneMission(
    request.user,
    request.params.missionId,
    request.body.reason,
  )
  response.status(200).json({ success: true, message: 'Drone mission aborted.', data: { mission } })
}
