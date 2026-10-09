import { createHash, randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import ApiError from './ApiError.js'

function configuredSecret(secret, name) {
  if (!secret) {
    throw new ApiError(503, `${name} is not configured.`, 'AUTH_NOT_CONFIGURED')
  }
  return secret
}

export function durationToMilliseconds(duration) {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration)
  if (!match) {
    throw new ApiError(500, 'Token lifetime configuration is invalid.', 'INVALID_TOKEN_CONFIGURATION')
  }

  const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }
  return Number(match[1]) * units[match[2]]
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function createAccessToken(user) {
  const secret = configuredSecret(env.jwtAccessSecret, 'JWT_ACCESS_SECRET')
  return jwt.sign(
    { role: user.role, type: 'access' },
    secret,
    {
      algorithm: 'HS256',
      subject: user._id.toString(),
      expiresIn: env.accessTokenTtl,
    },
  )
}

export function createRefreshToken(user, sessionId = randomUUID()) {
  const secret = configuredSecret(env.jwtRefreshSecret, 'JWT_REFRESH_SECRET')
  const tokenId = randomUUID()
  const token = jwt.sign(
    { type: 'refresh', sid: sessionId },
    secret,
    {
      algorithm: 'HS256',
      subject: user._id.toString(),
      jwtid: tokenId,
      expiresIn: env.refreshTokenTtl,
    },
  )
  const expiresAt = new Date(Date.now() + durationToMilliseconds(env.refreshTokenTtl))

  return {
    token,
    sessionId,
    tokenId,
    tokenHash: hashToken(token),
    expiresAt,
  }
}

export function verifyAccessToken(token) {
  return jwt.verify(
    token,
    configuredSecret(env.jwtAccessSecret, 'JWT_ACCESS_SECRET'),
    { algorithms: ['HS256'] },
  )
}

export function verifyRefreshToken(token) {
  return jwt.verify(
    token,
    configuredSecret(env.jwtRefreshSecret, 'JWT_REFRESH_SECRET'),
    { algorithms: ['HS256'] },
  )
}

export function verify(token, expectedType = 'access') {
  if (!['access', 'refresh'].includes(expectedType)) {
    throw new ApiError(500, 'Token type configuration is invalid.', 'INVALID_TOKEN_CONFIGURATION')
  }
  const isAccess = expectedType === 'access'
  const verifier = isAccess ? verifyAccessToken : verifyRefreshToken
  const invalidCode = isAccess ? 'ACCESS_TOKEN_INVALID' : 'INVALID_REFRESH_TOKEN'
  const expiredCode = isAccess ? 'ACCESS_TOKEN_EXPIRED' : 'INVALID_REFRESH_TOKEN'

  let payload
  try {
    payload = verifier(token)
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new ApiError(
        401,
        isAccess ? 'Access token has expired.' : 'Refresh token has expired.',
        expiredCode,
      )
    }
    if (['JsonWebTokenError', 'NotBeforeError'].includes(error.name)) {
      throw new ApiError(401, 'Token is invalid.', invalidCode)
    }
    throw error
  }

  if (payload.type !== expectedType) {
    throw new ApiError(401, 'Token is invalid for this operation.', invalidCode)
  }
  return payload
}

export const signAccess = createAccessToken
export const signRefresh = createRefreshToken
