import HealthCentre from '../src/models/HealthCentre.js'
import HealthRecord from '../src/models/HealthRecord.js'
import DroneMission from '../src/models/DroneMission.js'
import LandingPoint from '../src/models/LandingPoint.js'
import Patient from '../src/models/Patient.js'
import User from '../src/models/User.js'

describe('seed model definitions', () => {
  test('hashes passwords before save, compares credentials, and excludes secrets from JSON', async () => {
    const user = new User({
      name: 'Demo User',
      phone: '9000000001',
      passwordHash: 'local-seed-password',
      role: 'patient',
      fcmToken: 'demo-device-token',
      refreshTokens: [{
        tokenHash: 'demo-refresh-hash',
        sessionId: 'demo-session-id',
        tokenId: 'demo-token-id',
        expiresAt: new Date(Date.now() + 60_000),
      }],
    })

    await new Promise((resolve, reject) => {
      User.schema.s.hooks.execPre('save', user, [], (error) => {
        if (error) reject(error)
        else resolve()
      })
    })

    expect(user.passwordHash).not.toBe('local-seed-password')
    expect(user.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/)
    expect(await user.comparePassword('local-seed-password')).toBe(true)
    expect(await user.comparePassword('incorrect-password')).toBe(false)
    const serialized = user.toJSON()
    expect(serialized).not.toHaveProperty('passwordHash')
    expect(serialized).not.toHaveProperty('refreshTokens')
    expect(serialized).not.toHaveProperty('fcmToken')
    expect(User.schema.path('phone').options.unique).toBe(true)
    expect(User.schema.path('role').enumValues).toEqual(['patient', 'doctor', 'chw', 'admin'])
    expect(User.schema.path('language').enumValues).toEqual(['en', 'te'])
  })

  test('declares required role profile references and unique identifiers', () => {
    expect(User.schema.path('lastLogin')).toBeDefined()
    expect(User.schema.path('fcmToken').options.select).toBe(false)
    expect(User.schema.path('refreshTokens').instance).toBe('Array')
    expect(Patient.schema.path('user').options.ref).toBe('User')
    expect(Patient.schema.path('assignedDoctor').options.ref).toBe('Doctor')
    expect(Patient.schema.path('assignedChw').options.ref).toBe('Chw')
    expect(HealthRecord.schema.path('clientId').options.match).toBeDefined()
    expect(HealthRecord.schema.indexes()).toContainEqual([
      { clientId: 1 },
      expect.objectContaining({ unique: true, sparse: true }),
    ])
    expect(HealthRecord.schema.indexes()).toContainEqual([
      { patient: 1, recordedAt: -1, _id: -1 },
      expect.any(Object),
    ])
    expect(DroneMission.schema.path('sosIncident').options.unique).toBe(true)
    expect(DroneMission.schema.path('landingPoint').options.ref).toBe('LandingPoint')
    expect(DroneMission.schema.path('status').enumValues).toEqual([
      'requested', 'approved', 'dispatched', 'enRoute', 'arrived', 'delivered', 'aborted',
    ])
  })

  test('defines 2dsphere indexes for patient, health-centre, and landing-point coordinates', () => {
    for (const model of [Patient, HealthCentre, LandingPoint]) {
      expect(model.schema.indexes()).toContainEqual([
        { location: '2dsphere' },
        expect.any(Object),
      ])
    }
  })

  test('validates GeoJSON coordinate order and point shape for seed records', async () => {
    const healthCentre = new HealthCentre({
      name: 'Demo Health Centre',
      type: 'PHC',
      address: 'Demo address',
      location: { type: 'Point', coordinates: [80.64, 16.24] },
    })
    const landingPoint = new LandingPoint({
      village: 'Demo Village',
      name: 'Demo Landing Point',
      surfaceType: 'open_ground',
      contactPerson: 'Demo Contact',
      phone: '9000000201',
      location: { type: 'Point', coordinates: [80.64, 16.24] },
    })

    await expect(healthCentre.validate()).resolves.toBeUndefined()
    healthCentre.location.coordinates = [181, 16.24]
    await expect(healthCentre.validate()).rejects.toThrow()
    await expect(landingPoint.validate()).resolves.toBeUndefined()
  })
})
