import {
  acknowledgeAlert,
  getAlert,
  listAlerts,
  resolveAlert,
} from '../services/alertService.js'

export async function getAlerts(request, response) {
  const result = await listAlerts(request.user, request.query)
  response.status(200).json({
    success: true,
    message: 'Alerts retrieved.',
    data: result,
  })
}

export async function getAlertById(request, response) {
  const alert = await getAlert(request.user, request.params.alertId)
  response.status(200).json({
    success: true,
    message: 'Alert retrieved.',
    data: { alert },
  })
}

export async function postAcknowledgeAlert(request, response) {
  const alert = await acknowledgeAlert(request.user, request.params.alertId, request.body.note)
  response.status(200).json({
    success: true,
    message: 'Alert acknowledged.',
    data: { alert },
  })
}

export async function postResolveAlert(request, response) {
  const alert = await resolveAlert(
    request.user,
    request.params.alertId,
    request.body.resolutionNote,
  )
  response.status(200).json({
    success: true,
    message: 'Alert resolved.',
    data: { alert },
  })
}
