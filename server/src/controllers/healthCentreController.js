import {
  createHealthCentre,
  deactivateHealthCentre,
  findNearestHealthCentres,
  getHealthCentre,
  listBookableHealthCentres,
  listHealthCentres,
  updateHealthCentre,
} from '../services/healthCentreService.js'

export async function getNearestHealthCentres(request, response) {
  const centres = await findNearestHealthCentres(request.query)
  response.status(200).json({
    success: true,
    message: 'Nearby health centres retrieved.',
    data: { items: centres },
  })
}

export async function getHealthCentres(request, response) {
  const result = await listHealthCentres(request.query)
  response.status(200).json({
    success: true,
    message: 'Health centres retrieved.',
    data: result,
  })
}

export async function getBookableHealthCentres(_request, response) {
  const items = await listBookableHealthCentres()
  response.status(200).json({
    success: true,
    message: 'Active health centres retrieved.',
    data: { items },
  })
}

export async function postHealthCentre(request, response) {
  const centre = await createHealthCentre(request.user, request.body)
  response.status(201).json({
    success: true,
    message: 'Health centre created.',
    data: { centre },
  })
}

export async function getHealthCentreById(request, response) {
  const centre = await getHealthCentre(request.params.centreId)
  response.status(200).json({
    success: true,
    message: 'Health centre retrieved.',
    data: { centre },
  })
}

export async function patchHealthCentre(request, response) {
  const centre = await updateHealthCentre(request.user, request.params.centreId, request.body)
  response.status(200).json({
    success: true,
    message: 'Health centre updated.',
    data: { centre },
  })
}

export async function deleteHealthCentre(request, response) {
  const centre = await deactivateHealthCentre(request.user, request.params.centreId)
  response.status(200).json({
    success: true,
    message: 'Health centre deactivated.',
    data: { centre },
  })
}
