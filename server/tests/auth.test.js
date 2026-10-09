import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import app from '../src/app.js'
import AuditLog from '../src/models/AuditLog.js'
import { env } from '../src/config/env.js'
import Chw from '../src/models/Chw.js'
import Doctor from '../src/models/Doctor.js'
import Patient from '../src/models/Patient.js'
import User from '../src/models/User.js'
import { removeExpiredRefreshTokens, updateLanguage } from '../src/services/authService.js'

let mongo

const patientRegistration = {
  name: 'Test Patient',
  phone: '9876543210',
  password: 'patient-password-123',
  language: 'te',
  village: 'Mangalagiri',
  mandal: 'Mangalagiri',
  district: 'Guntur',
  consent: { accepted: true, policyVersion: 'test-policy-v1' },
}

async function createAccount(overrides = {}) {
  return User.create({
    name: 'Test User',
    phone: '9876543210',
    passwordHash: 'test-password-123',
    role: 'patient',
    ...overrides,
  })
}

function cookiePair(response) {
  const header = response.headers['set-cookie']?.find((cookie) => cookie.startsWith('refreshToken='))
  return header?.split(';')[0]
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await Promise.all([
    AuditLog.init(),
    User.init(),
    Patient.init(),
    Doctor.init(),
    Chw.init(),
  ])
})

afterEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('authentication API', () => {
  test('sets browser security headers and enforces the exact CORS allowlist', async () => {
    const allowedOrigin = await request(app)
      .get('/')
      .set('Origin', 'http://localhost:5173')
      .expect(200)
    expect(allowedOrigin.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    expect(allowedOrigin.headers['content-security-policy']).toContain("default-src 'self'")

    const deniedOrigin = await request(app)
      .get('/')
      .set('Origin', 'https://untrusted.example')
      .expect(403)
    expect(deniedOrigin.body.error.code).toBe('CORS_ORIGIN_DENIED')
  })

  test('registers only a patient account and creates its profile', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...patientRegistration, phone: '+919876543210' })
      .expect(201)

    expect(response.body.success).toBe(true)
    expect(response.body.data.user).toMatchObject({
      phone: '9876543210',
      role: 'patient',
      language: 'te',
    })
    expect(response.body.data.user).not.toHaveProperty('passwordHash')
    expect(await Patient.countDocuments()).toBe(1)
    const storedUser = await User.findOne({ phone: '9876543210' }).select('+passwordHash')
    expect(storedUser.role).toBe('patient')
    expect(storedUser.consent).toMatchObject({
      status: 'accepted',
      policyVersion: 'test-policy-v1',
    })
    expect(storedUser.passwordHash).not.toBe(patientRegistration.password)
    expect(await storedUser.comparePassword(patientRegistration.password)).toBe(true)
  })

  test('rejects registration without an Indian mobile number or required village', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...patientRegistration, phone: '12345', village: '' })
      .expect(400)

    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(response.body.error.details.map(({ field }) => field)).toEqual(
      expect.arrayContaining(['phone', 'village']),
    )
    expect(await User.countDocuments()).toBe(0)
  })

  test('logs in, sets a secure HttpOnly-scoped refresh cookie, and loads /me', async () => {
    await createAccount()

    const response = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9876543210', password: 'test-password-123' })
      .expect(200)

    expect(response.body.data.accessToken).toEqual(expect.any(String))
    expect(response.body.data).not.toHaveProperty('refreshToken')
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly')
    expect(response.headers['set-cookie'][0]).toContain('Path=/api/auth')
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Strict')
    const storedUser = await User.findOne({ phone: '9876543210' }).select('+passwordHash')
    expect(bcrypt.getRounds(storedUser.passwordHash)).toBeGreaterThanOrEqual(12)
    expect(await AuditLog.findOne({ action: 'login.success' })).toMatchObject({
      actorRole: 'patient',
      resourceType: 'User',
    })

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${response.body.data.accessToken}`)
      .expect(200)

    expect(me.body.data.user).toMatchObject({ phone: '9876543210', role: 'patient' })
    expect(me.body.data.profile).toBeNull()
  })

  test('audits unknown login identifiers without storing the phone number', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ phone: '9876543299', password: 'invalid-password-123' })
      .expect(401)

    const event = await AuditLog.findOne({
      action: 'login.failure',
      reason: 'invalid_credentials',
    }).select('+subjectHash')
    expect(event.subjectHash).toMatch(/^[a-f0-9]{64}$/)
    expect(event.subjectHash).not.toContain('9876543299')
    expect(event.resourceType).toBe('SystemReport')
  })

  test('saves a supported language preference on the authenticated user profile', async () => {
    const user = await createAccount()
    const response = await updateLanguage(user, 'te')

    expect(response.user.language).toBe('te')
    expect((await User.findOne({ phone: '9876543210' })).language).toBe('te')
  })

  test('locks an account after five wrong passwords for the configured period', async () => {
    await createAccount()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app)
        .post('/api/auth/login')
        .send({ phone: '9876543210', password: 'wrong-password-123' })
        .expect(401)
    }

    const storedUser = await User.findOne({ phone: '9876543210' })
      .select('+failedLoginCount +lockedUntil')
    expect(storedUser.failedLoginCount).toBe(5)
    expect(storedUser.lockedUntil.getTime()).toBeGreaterThan(Date.now())
    await request(app)
      .post('/api/auth/login')
      .send({ phone: '9876543210', password: 'test-password-123' })
      .expect(423)
  })

  test('rotates refresh tokens and invalidates sessions on token reuse', async () => {
    await createAccount()
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9876543210', password: 'test-password-123' })
      .expect(200)
    const oldCookie = cookiePair(loginResponse)

    const refreshResponse = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', oldCookie)
      .expect(200)
    const newCookie = cookiePair(refreshResponse)

    expect(newCookie).toBeDefined()
    expect(newCookie).not.toBe(oldCookie)
    const storedUser = await User.findOne({ phone: '9876543210' })
      .select('+refreshTokens.tokenHash')
    expect(storedUser.refreshTokens).toHaveLength(1)
    expect(storedUser.refreshTokens[0].tokenHash).not.toBe(oldCookie.split('=')[1])
    expect(storedUser.refreshTokens[0].rotatedAt).toBeInstanceOf(Date)

    const replay = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', oldCookie)
      .expect(401)
    expect(replay.body.error.code).toBe('REFRESH_TOKEN_REUSE')

    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', newCookie)
      .expect(401)
    const revokedUser = await User.findOne({ phone: '9876543210' })
      .select('+refreshTokens.tokenHash')
    expect(revokedUser.refreshTokens[0].revokedAt).toBeInstanceOf(Date)
  })

  test('prunes expired refresh tokens but retains revoked tokens until their expiry', async () => {
    const user = await createAccount()
    const now = Date.now()
    user.refreshTokens = [
      {
        tokenHash: 'expired-token-hash',
        sessionId: 'expired-session',
        tokenId: 'expired-token',
        expiresAt: new Date(now - 1000),
      },
      {
        tokenHash: 'revoked-token-hash',
        sessionId: 'revoked-session',
        tokenId: 'revoked-token',
        expiresAt: new Date(now + 60_000),
        revokedAt: new Date(now - 500),
      },
    ]
    await user.save()

    await removeExpiredRefreshTokens()

    const stored = await User.findById(user._id).select('+refreshTokens.tokenHash')
    expect(stored.refreshTokens).toHaveLength(1)
    expect(stored.refreshTokens[0].sessionId).toBe('revoked-session')
  })

  test('rejects a refresh request without a cookie and an invalid access token', async () => {
    const missingCookie = await request(app)
      .post('/api/auth/refresh')
      .expect(401)
    expect(missingCookie.body.error.code).toBe('INVALID_REFRESH_TOKEN')

    const invalidAccess = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer tampered-token')
      .expect(401)
    expect(invalidAccess.body.error.code).toBe('ACCESS_TOKEN_INVALID')

    const missingAccess = await request(app)
      .get('/api/auth/me')
      .expect(401)
    expect(missingAccess.body.error.code).toBe('ACCESS_TOKEN_MISSING')
  })

  test('returns a distinct error for an expired access token', async () => {
    const user = await createAccount()
    const expiredToken = jwt.sign(
      { type: 'access', role: 'patient', exp: Math.floor(Date.now() / 1000) - 60 },
      env.jwtAccessSecret,
      { algorithm: 'HS256', subject: user._id.toString() },
    )

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401)

    expect(response.body.error.code).toBe('ACCESS_TOKEN_EXPIRED')
  })

  test('returns a distinct error for a tampered access token', async () => {
    const user = await createAccount()
    const validToken = jwt.sign(
      { type: 'access', role: 'patient' },
      env.jwtAccessSecret,
      { algorithm: 'HS256', subject: user._id.toString(), expiresIn: '15m' },
    )
    const tamperedToken = `${validToken.slice(0, -1)}${validToken.endsWith('a') ? 'b' : 'a'}`

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tamperedToken}`)
      .expect(401)

    expect(response.body.error.code).toBe('ACCESS_TOKEN_INVALID')
  })

  test('rejects tokens belonging to inactive accounts', async () => {
    const user = await createAccount({ isActive: false })
    const token = jwt.sign(
      { type: 'access', role: 'patient' },
      env.jwtAccessSecret,
      { algorithm: 'HS256', subject: user._id.toString(), expiresIn: '15m' },
    )

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)

    expect(response.body.error.code).toBe('ACCOUNT_INACTIVE')
  })

  test('requires authentication and admin role to provision staff users', async () => {
    await createAccount()
    const patientLogin = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9876543210', password: 'test-password-123' })
      .expect(200)

    await request(app)
      .post('/api/auth/admin/users')
      .set('Authorization', `Bearer ${patientLogin.body.data.accessToken}`)
      .send({
        name: 'New Doctor',
        phone: '9123456789',
        password: 'doctor-password-123',
        role: 'doctor',
        profile: { specialization: 'General Medicine', registrationNo: 'TEST-001' },
      })
      .expect(403)

    const admin = await createAccount({ phone: '9876543211', role: 'admin', name: 'Admin' })
    const adminToken = (await request(app)
      .post('/api/auth/login')
      .send({ phone: admin.phone, password: 'test-password-123' })
      .expect(200)).body.data.accessToken

    const created = await request(app)
      .post('/api/auth/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'New Doctor',
        phone: '9123456789',
        password: 'doctor-password-123',
        role: 'doctor',
        profile: { specialization: 'General Medicine', registrationNo: 'TEST-001' },
      })
      .expect(201)

    expect(created.body.data.user.role).toBe('doctor')
    expect(await Doctor.countDocuments()).toBe(1)
    expect(await Patient.countDocuments()).toBe(0)
  })

  test('changes password, revokes refresh sessions, and requires the new password', async () => {
    await createAccount()
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9876543210', password: 'test-password-123' })
      .expect(200)

    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${loginResponse.body.data.accessToken}`)
      .send({ currentPassword: 'test-password-123', newPassword: 'new-password-456' })
      .expect(200)

    const storedUser = await User.findOne({ phone: '9876543210' })
      .select('+passwordHash +refreshTokens.tokenHash')
    expect(storedUser.refreshTokens).toHaveLength(0)
    expect(await storedUser.comparePassword('new-password-456')).toBe(true)
    await request(app)
      .post('/api/auth/login')
      .send({ phone: '9876543210', password: 'test-password-123' })
      .expect(401)
    await request(app)
      .post('/api/auth/login')
      .send({ phone: '9876543210', password: 'new-password-456' })
      .expect(200)
  })

  test('logout revokes the presented refresh token and clears the cookie', async () => {
    await createAccount()
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9876543210', password: 'test-password-123' })
      .expect(200)
    const refreshCookie = cookiePair(loginResponse)

    const logoutResponse = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${loginResponse.body.data.accessToken}`)
      .set('Cookie', refreshCookie)
      .expect(200)

    expect(logoutResponse.body.data.signedOut).toBe(true)
    expect(logoutResponse.headers['set-cookie'][0]).toContain('refreshToken=;')
    const storedUser = await User.findOne({ phone: '9876543210' })
      .select('+refreshTokens.tokenHash')
    expect(storedUser.refreshTokens[0].revokedAt).toBeInstanceOf(Date)
  })
})
