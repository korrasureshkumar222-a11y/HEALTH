import AuditLog from '../models/AuditLog.js'

export default function auditSensitiveAction({
  action = 'data.view',
  resourceType = 'SystemReport',
  resourceIdParam,
  reason,
} = {}) {
  return async function recordSensitiveAction(request, _response, next) {
    try {
      await AuditLog.create({
        actor: request.user?._id,
        actorRole: request.user?.role,
        action,
        resourceType,
        ...(resourceIdParam && request.params[resourceIdParam]
          ? { resourceId: request.params[resourceIdParam] }
          : {}),
        ...(reason ? { reason } : {}),
      })
      next()
    } catch (error) {
      next(error)
    }
  }
}
