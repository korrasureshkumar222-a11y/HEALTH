import ApiError from '../utils/ApiError.js'
import { canAccessPatient } from '../services/permissions.js'

export default function authorize(...roles) {
  return function checkRole(request, _response, next) {
    if (!request.user || !roles.includes(request.user.role)) {
      next(new ApiError(403, 'You are not allowed to perform this action.', 'FORBIDDEN'))
      return
    }
    next()
  }
}

export function authorizePatient(paramName = 'patientId') {
  return async function checkPatientAccess(request, _response, next) {
    try {
      if (!await canAccessPatient(request.user, request.params[paramName])) {
        next(new ApiError(403, 'You are not allowed to access this patient.', 'FORBIDDEN'))
        return
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}
