import { syncItems } from '../services/syncService.js'

export async function postSync(request, response) {
  const result = await syncItems(request.user, request.body.items)
  response.status(200).json({
    success: true,
    message: 'Offline sync batch processed.',
    data: result,
  })
}
