import {
  createSosIncident,
  getSosIncident,
  updateSosStatus,
} from '../services/sosService.js'

export async function postSos(request, response) {
  const result = await createSosIncident(request.user, request.body, request.body.patientId)
  response.status(result.duplicate ? 200 : 201).json({
    success: true,
    message: result.duplicate ? 'SOS request already received.' : 'SOS request received.',
    data: result,
  })
}

export async function getSos(request, response) {
  const incident = await getSosIncident(request.user, request.params.incidentId)
  response.status(200).json({
    success: true,
    message: 'SOS incident retrieved.',
    data: { incident },
  })
}

export async function patchSosStatus(request, response) {
  const incident = await updateSosStatus(
    request.user,
    request.params.incidentId,
    request.body,
  )
  response.status(200).json({
    success: true,
    message: 'SOS incident status updated.',
    data: { incident },
  })
}
