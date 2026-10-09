import mongoose from 'mongoose'
import User from '../models/User.js'
import ApiError from '../utils/ApiError.js'
import { verify } from '../utils/tokenUtils.js'

export async function protect(request, _response, next) {
  const authorization = request.get('authorization')
  const match = /^Bearer ([^\s]+)$/.exec(authorization ?? '')
  if (!match) {
    next(new ApiError(401, 'Authentication is required.', 'ACCESS_TOKEN_MISSING'))
    return
  }

  let payload
  try {
    payload = verify(match[1], 'access')
  } catch (error) {
    next(error)
    return
  }

  if (typeof payload.sub !== 'string' || !mongoose.isValidObjectId(payload.sub)) {
    next(new ApiError(401, 'Access token is invalid.', 'ACCESS_TOKEN_INVALID'))
    return
  }

  try {
    const user = await User.findById(payload.sub)
    if (!user) {
      next(new ApiError(401, 'Authentication is required.', 'ACCESS_TOKEN_INVALID'))
      return
    }
    if (!user.isActive) {
      next(new ApiError(401, 'This account is inactive.', 'ACCOUNT_INACTIVE'))
      return
    }

    request.user = user
    next()
  } catch (error) {
    next(error)
  }
}

export default protect
