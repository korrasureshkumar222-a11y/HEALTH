import { env } from '../config/env.js'
import * as Sentry from '@sentry/node'

export function notFoundHandler(request, response, next) {
  const error = new Error(`Route not found: ${request.method} ${request.originalUrl}`)
  error.statusCode = 404
  error.code = 'NOT_FOUND'
  next(error)
}

export function errorHandler(error, request, response, _next) {
  if (response.headersSent) {
    return
  }

  const isMalformedJson = error.type === 'entity.parse.failed'
  const statusCode = isMalformedJson
    ? 400
    : Number.isInteger(error.statusCode)
      ? error.statusCode
      : Number.isInteger(error.status)
        ? error.status
        : 500
  const message = statusCode >= 500 && env.nodeEnv === 'production'
    ? 'An unexpected server error occurred.'
    : isMalformedJson
      ? 'Request body contains invalid JSON.'
      : error.message || 'An unexpected server error occurred.'
  const payload = {
    success: false,
    message,
    error: {
      code: isMalformedJson
        ? 'INVALID_JSON'
        : error.code || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'),
    },
  }

  if (error.details !== undefined) {
    payload.error.details = error.details
  }

  if (env.nodeEnv !== 'test' && statusCode >= 500) {
    request.log?.error({
      err: error,
      message: error.message,
      method: request.method,
      path: request.path,
      requestId: request.requestId,
    }, 'Request failed with an internal server error.')
    if (env.sentryDsn) Sentry.captureException(error)
  }

  response.status(statusCode).json(payload)
}
