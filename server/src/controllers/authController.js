import { env } from '../config/env.js'
import {
  changePassword,
  createPrivilegedUser,
  getCurrentUser,
  login,
  logout,
  registerPatient,
  rotateRefreshToken,
  updateLanguage as updateUserLanguage,
} from '../services/authService.js'

const refreshCookieName = 'refreshToken'

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'strict',
    path: '/api/auth',
  }
}

function setRefreshCookie(response, token, expiresAt) {
  response.cookie(refreshCookieName, token, {
    ...cookieOptions(),
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  })
}

function clearRefreshCookie(response) {
  response.clearCookie(refreshCookieName, cookieOptions())
}

function sendSuccess(response, statusCode, message, data) {
  response.status(statusCode).json({ success: true, message, data })
}

export async function register(request, response) {
  const data = await registerPatient(request.body)
  sendSuccess(response, 201, 'Patient account created.', data)
}

export async function createStaffUser(request, response) {
  const data = await createPrivilegedUser(request.body, request.user)
  sendSuccess(response, 201, 'User account created.', data)
}

export async function loginUser(request, response) {
  const session = await login(request.body)
  setRefreshCookie(response, session.refreshToken, session.refreshTokenExpiresAt)
  sendSuccess(response, 200, 'Signed in.', {
    user: session.user,
    accessToken: session.accessToken,
    accessTokenExpiresIn: env.accessTokenTtl,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
  })
}

export async function refresh(request, response) {
  const session = await rotateRefreshToken(request.cookies?.[refreshCookieName])
  setRefreshCookie(response, session.refreshToken, session.refreshTokenExpiresAt)
  sendSuccess(response, 200, 'Session refreshed.', {
    user: session.user,
    accessToken: session.accessToken,
    accessTokenExpiresIn: env.accessTokenTtl,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
  })
}

export async function logoutUser(request, response) {
  await logout(request.user._id.toString(), request.cookies?.[refreshCookieName], request.user)
  clearRefreshCookie(response)
  sendSuccess(response, 200, 'Signed out.', { signedOut: true })
}

export async function getMe(request, response) {
  const data = await getCurrentUser(request.user)
  sendSuccess(response, 200, 'Current user loaded.', data)
}

export async function updateLanguage(request, response) {
  const data = await updateUserLanguage(request.user, request.body.language)
  sendSuccess(response, 200, 'Language preference updated.', data)
}

export async function updatePassword(request, response) {
  await changePassword(request.user, request.body.currentPassword, request.body.newPassword)
  clearRefreshCookie(response)
  sendSuccess(response, 200, 'Password changed. Sign in again on your devices.', {
    passwordChanged: true,
  })
}
