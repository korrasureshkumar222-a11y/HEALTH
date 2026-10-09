import ApiError from '../utils/ApiError.js'

export default function requireRefreshCookie(request, _response, next) {
  const token = request.cookies?.refreshToken
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) {
    next(new ApiError(401, 'Refresh token is required.', 'INVALID_REFRESH_TOKEN'))
    return
  }
  next()
}
