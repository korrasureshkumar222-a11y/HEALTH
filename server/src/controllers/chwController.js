import {
  createChwVisit,
  listChwVisits,
  updateChwVisit,
} from '../services/chwService.js'

export async function getVisits(request, response) {
  const result = await listChwVisits(request.user, request.query)
  response.status(200).json({
    success: true,
    message: 'CHW visits retrieved.',
    data: result,
  })
}

export async function postVisit(request, response) {
  const result = await createChwVisit(request.user, request.body)
  response.status(result.duplicate ? 200 : 201).json({
    success: true,
    message: result.duplicate ? 'Visit already recorded.' : 'Visit recorded.',
    data: result,
  })
}

export async function patchVisit(request, response) {
  const visit = await updateChwVisit(request.user, request.params.visitId, request.body)
  response.status(200).json({
    success: true,
    message: 'Visit updated.',
    data: { visit },
  })
}
