import bcrypt from 'bcryptjs'
import { createHmac } from 'node:crypto'
import User from '../models/User.js'
import Patient from '../models/Patient.js'
import Doctor from '../models/Doctor.js'
import Chw from '../models/Chw.js'
import AuditLog from '../models/AuditLog.js'
import ApiError from '../utils/ApiError.js'
import {
  createAccessToken,
  createRefreshToken,
  hashToken,
  verifyRefreshToken,
} from '../utils/tokenUtils.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const invalidCredentials = () => new ApiError(
  401,
  'Phone number or password is incorrect.',
  'INVALID_CREDENTIALS',
)

async function logAuthEvent({ action, user, phone, reason }) {
  await AuditLog.create({
    ...(user ? { actor: user._id, actorRole: user.role } : {}),
    ...(phone ? {
      subjectHash: createHmac('sha256', env.piiEncryptionKey ?? env.jwtRefreshSecret)
        .update(phone)
        .digest('hex'),
    } : {}),
    action,
    resourceType: user ? 'User' : 'SystemReport',
    ...(user ? { resourceId: user._id } : {}),
    ...(reason ? { reason } : {}),
  })
}

function assertAuthSecretsConfigured() {
  if (!env.jwtAccessSecret || !env.jwtRefreshSecret) {
    throw new ApiError(503, 'Authentication is not configured.', 'AUTH_NOT_CONFIGURED')
  }
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    language: user.language,
    isActive: user.isActive,
    lastLogin: user.lastLogin,
  }
}

function jwtError(error) {
  return error?.name === 'JsonWebTokenError'
    || error?.name === 'TokenExpiredError'
    || error?.name === 'NotBeforeError'
}

async function createUser(userData) {
  try {
    return await User.create(userData)
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, 'An account with this phone number or email already exists.', 'ACCOUNT_EXISTS')
    }
    throw error
  }
}

export async function registerPatient(input) {
  assertAuthSecretsConfigured()

  const existingPatient = await Patient.findOne({ phone: input.phone })
    .select('_id user status')
  if (existingPatient && (existingPatient.user || existingPatient.status !== 'active')) {
    throw new ApiError(409, 'This phone number already has a patient profile that cannot be linked.', 'PATIENT_PROFILE_EXISTS')
  }

  const user = await createUser({
    name: input.name,
    phone: input.phone,
    email: input.email,
    passwordHash: input.password,
    role: 'patient',
    language: input.language ?? 'en',
    consent: {
      status: 'accepted',
      policyVersion: input.consent.policyVersion,
      acceptedAt: new Date(),
    },
  })

  try {
    const pendingPatient = await Patient.findOne({ phone: input.phone, user: { $exists: false } })
    const patient = pendingPatient
      ? await Patient.findOneAndUpdate(
        { _id: pendingPatient._id, user: { $exists: false } },
        {
          $set: {
            user: user._id,
            name: input.name,
            language: input.language ?? 'en',
            age: input.age ?? pendingPatient.age,
            gender: input.gender ?? pendingPatient.gender,
            village: input.village,
            mandal: input.mandal ?? pendingPatient.mandal,
            district: input.district ?? pendingPatient.district,
            consent: {
              status: 'accepted',
              policyVersion: input.consent.policyVersion,
              acceptedAt: new Date(),
              capturedBy: user._id,
              method: 'self',
            },
          },
        },
        { new: true, runValidators: true },
      )
      : await Patient.create({
        user: user._id,
        phone: input.phone,
        language: input.language ?? 'en',
        age: input.age,
        gender: input.gender,
        village: input.village,
        mandal: input.mandal,
        district: input.district,
        conditions: [],
        consent: {
          status: 'accepted',
          policyVersion: input.consent.policyVersion,
          acceptedAt: new Date(),
          capturedBy: user._id,
          method: 'self',
        },
      })
    if (!patient) {
      throw new ApiError(409, 'This patient profile has already been linked to an account.', 'PATIENT_PROFILE_LINKED')
    }
    return {
      user: publicUser(user),
      patient: { id: patient._id.toString() },
    }
  } catch (error) {
    try {
      await User.deleteOne({ _id: user._id })
    } catch (cleanupError) {
      logger.error({
        event: 'auth.patient_registration_cleanup_failed',
        userId: user._id.toString(),
        name: cleanupError.name,
        code: cleanupError.code,
      }, 'Failed to remove incomplete patient account registration.')
    }
    if (error.code === 11000) {
      throw new ApiError(409, 'A patient profile or account already exists for this phone number.', 'PATIENT_PROFILE_EXISTS')
    }
    throw error
  }
}

export async function login(input) {
  assertAuthSecretsConfigured()

  const user = await User.findOne({ phone: input.phone })
    .select('+passwordHash +failedLoginCount +lockedUntil +refreshTokens.tokenHash')

  if (!user || !user.isActive) {
    await logAuthEvent({ action: 'login.failure', phone: input.phone, reason: 'invalid_credentials' })
    throw invalidCredentials()
  }

  const now = new Date()
  if (user.lockedUntil && user.lockedUntil > now) {
    await logAuthEvent({ action: 'login.failure', user, reason: 'account_locked' })
    throw new ApiError(423, 'Sign-in is temporarily locked. Try again later.', 'ACCOUNT_TEMPORARILY_LOCKED')
  }

  const passwordMatches = await user.comparePassword(input.password)
  if (!passwordMatches) {
    const updated = await User.findByIdAndUpdate(
      user._id,
      { $inc: { failedLoginCount: 1 } },
      { new: true, projection: { failedLoginCount: 1 } },
    )

    if (updated && updated.failedLoginCount >= env.authMaxFailedAttempts) {
      await User.updateOne(
        { _id: user._id },
        { $set: { lockedUntil: new Date(Date.now() + env.authLockDurationMinutes * 60_000) } },
      )
    }
    await logAuthEvent({ action: 'login.failure', user, reason: 'invalid_credentials' })
    throw invalidCredentials()
  }

  const refreshToken = createRefreshToken(user)
  const accessToken = createAccessToken(user)

  user.failedLoginCount = 0
  user.lockedUntil = undefined
  user.lastLogin = now
  if (bcrypt.getRounds(user.passwordHash) < env.authBcryptRounds) {
    user.passwordHash = input.password
  }
  user.refreshTokens = user.refreshTokens.filter((token) => token.expiresAt > now && !token.revokedAt)
  user.refreshTokens.push({
    tokenHash: refreshToken.tokenHash,
    sessionId: refreshToken.sessionId,
    tokenId: refreshToken.tokenId,
    expiresAt: refreshToken.expiresAt,
    createdAt: now,
  })
  await logAuthEvent({ action: 'login.success', user })
  await user.save()

  return {
    user: publicUser(user),
    accessToken,
    refreshToken: refreshToken.token,
    refreshTokenExpiresAt: refreshToken.expiresAt,
  }
}

export async function removeExpiredRefreshTokens() {
  const now = new Date()
  return User.updateMany(
    { 'refreshTokens.0': { $exists: true } },
    {
      $pull: {
        refreshTokens: {
          expiresAt: { $lte: now },
        },
      },
    },
  )
}

async function revokeAllRefreshTokens(userId) {
  const now = new Date()
  await User.updateOne(
    { _id: userId },
    { $set: { 'refreshTokens.$[].revokedAt': now } },
  )
}

export async function rotateRefreshToken(token) {
  assertAuthSecretsConfigured()

  let payload
  try {
    payload = verifyRefreshToken(token)
  } catch (error) {
    if (jwtError(error)) {
      throw new ApiError(401, 'Refresh token is invalid or expired.', 'INVALID_REFRESH_TOKEN')
    }
    throw error
  }

  if (
    payload.type !== 'refresh'
    || typeof payload.sub !== 'string'
    || typeof payload.jti !== 'string'
    || typeof payload.sid !== 'string'
  ) {
    throw new ApiError(401, 'Refresh token is invalid.', 'INVALID_REFRESH_TOKEN')
  }

  const now = new Date()
  const tokenHash = hashToken(token)
  const user = await User.findById(payload.sub)
    .select('+refreshTokens.tokenHash')
  if (!user || !user.isActive) {
    throw new ApiError(401, 'Refresh token is invalid.', 'INVALID_REFRESH_TOKEN')
  }

  const savedToken = user.refreshTokens.find((entry) => entry.sessionId === payload.sid)
  if (!savedToken) {
    throw new ApiError(401, 'Refresh token is invalid.', 'INVALID_REFRESH_TOKEN')
  }
  if (savedToken.revokedAt) {
    await revokeAllRefreshTokens(user._id)
    await logAuthEvent({ action: 'auth.refresh.reuse', user, reason: 'revoked_token_replayed' })
    throw new ApiError(401, 'Refresh token reuse detected. Sign in again.', 'REFRESH_TOKEN_REUSE')
  }
  if (savedToken.tokenId !== payload.jti || savedToken.tokenHash !== tokenHash) {
    await revokeAllRefreshTokens(user._id)
    await logAuthEvent({ action: 'auth.refresh.reuse', user, reason: 'token_identifier_mismatch' })
    throw new ApiError(401, 'Refresh token reuse detected. Sign in again.', 'REFRESH_TOKEN_REUSE')
  }
  if (savedToken.expiresAt <= now) {
    throw new ApiError(401, 'Refresh token is invalid or expired.', 'INVALID_REFRESH_TOKEN')
  }

  const replacement = createRefreshToken(user, payload.sid)
  const nextAccessToken = createAccessToken(user)
  const result = await User.updateOne(
    {
      _id: user._id,
      isActive: true,
      refreshTokens: {
        $elemMatch: {
          sessionId: payload.sid,
          tokenId: payload.jti,
          tokenHash,
          revokedAt: { $exists: false },
          expiresAt: { $gt: now },
        },
      },
    },
    [{
      $set: {
        refreshTokens: {
          $map: {
            input: '$refreshTokens',
            as: 'savedToken',
            in: {
              $cond: [
                { $eq: ['$$savedToken.sessionId', payload.sid] },
                {
                  $mergeObjects: [
                    '$$savedToken',
                    {
                      tokenId: replacement.tokenId,
                      tokenHash: replacement.tokenHash,
                      expiresAt: replacement.expiresAt,
                      rotatedAt: now,
                    },
                  ],
                },
                '$$savedToken',
              ],
            },
          },
        },
      },
    }],
  )

  if (result.modifiedCount !== 1) {
    const currentUser = await User.findById(user._id).select('+refreshTokens.tokenHash')
    const currentToken = currentUser?.refreshTokens.find((entry) => entry.sessionId === payload.sid)
    if (
      currentToken
      && (currentToken.tokenId !== payload.jti || currentToken.tokenHash !== tokenHash || currentToken.revokedAt)
    ) {
      await revokeAllRefreshTokens(user._id)
      await logAuthEvent({ action: 'auth.refresh.reuse', user, reason: 'concurrent_refresh_replay' })
      throw new ApiError(401, 'Refresh token reuse detected. Sign in again.', 'REFRESH_TOKEN_REUSE')
    }
    throw new ApiError(401, 'Refresh token is invalid or expired.', 'INVALID_REFRESH_TOKEN')
  }

  return {
    user: publicUser(user),
    accessToken: nextAccessToken,
    refreshToken: replacement.token,
    refreshTokenExpiresAt: replacement.expiresAt,
  }
}

export async function logout(userId, refreshToken, actor) {
  if (!refreshToken) {
    if (actor) await logAuthEvent({ action: 'auth.logout', user: actor })
    return
  }

  let payload
  try {
    payload = verifyRefreshToken(refreshToken)
  } catch (error) {
    if (jwtError(error)) return
    throw error
  }

  if (payload.type !== 'refresh' || payload.sub !== userId || !payload.jti || !payload.sid) return
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        'refreshTokens.$[current].revokedAt': new Date(),
      },
    },
    {
      arrayFilters: [{
        'current.sessionId': payload.sid,
        'current.tokenId': payload.jti,
        'current.tokenHash': hashToken(refreshToken),
        'current.revokedAt': { $exists: false },
      }],
    },
  )
  if (actor) await logAuthEvent({ action: 'auth.logout', user: actor })
}

export async function getCurrentUser(user) {
  let profile = null
  if (user.role === 'patient') profile = await Patient.findOne({ user: user._id })
  if (user.role === 'doctor') profile = await Doctor.findOne({ user: user._id })
  if (user.role === 'chw') profile = await Chw.findOne({ user: user._id })

  return {
    user: publicUser(user),
    profile: profile ? profile.toJSON() : null,
  }
}

export async function updateLanguage(user, language) {
  const updatedUser = await User.findOneAndUpdate(
    { _id: user._id, isActive: true },
    { $set: { language } },
    { new: true, runValidators: true },
  )
  if (!updatedUser) {
    throw new ApiError(401, 'Authentication is required.', 'UNAUTHENTICATED')
  }
  return { user: publicUser(updatedUser) }
}

export async function changePassword(user, currentPassword, newPassword) {
  const passwordUser = await User.findById(user._id)
    .select('+passwordHash +refreshTokens.tokenHash')
  if (!passwordUser || !passwordUser.isActive) {
    throw new ApiError(401, 'Authentication is required.', 'UNAUTHENTICATED')
  }

  if (!await passwordUser.comparePassword(currentPassword)) {
    throw new ApiError(400, 'Current password is incorrect.', 'CURRENT_PASSWORD_INCORRECT')
  }

  passwordUser.passwordHash = newPassword
  passwordUser.refreshTokens = []
  passwordUser.failedLoginCount = 0
  passwordUser.lockedUntil = undefined
  await passwordUser.save()
  await logAuthEvent({ action: 'auth.password.change', user: passwordUser })
}

export async function createPrivilegedUser(input, actor) {
  const user = await createUser({
    name: input.name,
    phone: input.phone,
    email: input.email,
    passwordHash: input.password,
    role: input.role,
  })

  try {
    let profile = null
    if (input.role === 'doctor') {
      profile = await Doctor.create({
        user: user._id,
        ...input.profile,
      })
    } else if (input.role === 'chw') {
      profile = await Chw.create({
        user: user._id,
        ...input.profile,
      })
    }

    await AuditLog.create({
      actor: actor._id,
      actorRole: actor.role,
      action: 'user.role.change',
      resourceType: 'User',
      resourceId: user._id,
      changedFields: ['role'],
      reason: `Provisioned account with role ${input.role}.`,
    })

    return {
      user: publicUser(user),
      profile: profile ? profile.toJSON() : null,
    }
  } catch (error) {
    try {
      await User.deleteOne({ _id: user._id })
    } catch (cleanupError) {
      logger.error({
        event: 'auth.staff_registration_cleanup_failed',
        userId: user._id.toString(),
        name: cleanupError.name,
        code: cleanupError.code,
      }, 'Failed to remove incomplete privileged account.')
    }
    if (error.code === 11000) {
      throw new ApiError(409, 'The account or profile identifier already exists.', 'ACCOUNT_EXISTS')
    }
    throw error
  }
}
