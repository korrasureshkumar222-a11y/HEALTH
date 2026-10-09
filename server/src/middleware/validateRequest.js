import ApiError from '../utils/ApiError.js'

export default function validateRequest(schema, source = 'body') {
  return function validate(request, _response, next) {
    const input = source === 'body' && request.body === undefined ? {} : request[source]
    const result = schema.safeParse(input)
    if (!result.success) {
      next(new ApiError(
        400,
        'Request validation failed.',
        'VALIDATION_ERROR',
        result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      ))
      return
    }

    request[source] = result.data
    next()
  }
}
