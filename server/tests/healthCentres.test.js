import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import AuditLog from '../src/models/AuditLog.js'
import HealthCentre from '../src/models/HealthCentre.js'
import User from '../src/models/User.js'
import { createAccessToken } from '../src/utils/tokenUtils.js'

let mongo
let admin
let patient

async function createUser(role, phone) {
  return User.create({ name: `${role} ${phone}`, phone, passwordHash: 'health-centre-test-password', role })
}

function bearer(user) {
  return `Bearer ${createAccessToken(user)}`
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await Promise.all([User.init(), HealthCentre.init(), AuditLog.init()])
})

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  )
  admin = await createUser('admin', '9876500101')
  patient = await createUser('patient', '9876500102')
  await HealthCentre.create([
    {
      name: 'Closest PHC',
      type: 'PHC',
      address: 'Village Road',
      phone: '08610000001',
      services: ['primary care'],
      is24x7: true,
      location: { type: 'Point', coordinates: [80.42, 16.43] },
    },
    {
      name: 'Nearby CHC',
      type: 'CHC',
      address: 'Mandal Road',
      location: { type: 'Point', coordinates: [80.45, 16.43] },
    },
    {
      name: 'Inactive PHC',
      type: 'PHC',
      address: 'Closed Road',
      isActive: false,
      location: { type: 'Point', coordinates: [80.421, 16.43] },
    },
  ])
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('Health centre API', () => {
  test('returns nearest active centres in distance order and supports type and limit filters', async () => {
    const response = await request(app)
      .get('/api/health-centres/nearest?lat=16.43&lng=80.419&limit=5')
      .set('Authorization', bearer(patient))
      .expect(200)

    expect(response.body.data.items.map(({ name }) => name))
      .toEqual(['Closest PHC', 'Nearby CHC'])
    expect(response.body.data.items[0].distanceKm).toEqual(expect.any(Number))
    expect(response.body.data.items[0].distanceMeters).toEqual(expect.any(Number))

    const filtered = await request(app)
      .get('/api/health-centres/nearest?lat=16.43&lng=80.419&limit=1&type=CHC')
      .set('Authorization', bearer(patient))
      .expect(200)
    expect(filtered.body.data.items.map(({ name }) => name)).toEqual(['Nearby CHC'])
  })

  test('validates coordinate ranges and requires authentication', async () => {
    await request(app)
      .get('/api/health-centres/nearest?lat=91&lng=80')
      .set('Authorization', bearer(patient))
      .expect(400)
    await request(app)
      .get('/api/health-centres/nearest?lat=16&lng=80')
      .expect(401)
  })

  test('supports audited admin create, update, list, detail and soft-delete operations', async () => {
    const input = {
      name: 'New Community Centre',
      type: 'CHC',
      address: 'Main Road',
      phone: '08610000002',
      services: ['emergency care'],
      hasAmbulance: true,
      hasLandingPoint: true,
      is24x7: true,
      location: { type: 'Point', coordinates: [80.5, 16.5] },
    }
    const created = await request(app)
      .post('/api/health-centres')
      .set('Authorization', bearer(admin))
      .send(input)
      .expect(201)
    const centreId = created.body.data.centre._id
    expect(created.body.data.centre.name).toBe(input.name)

    const updated = await request(app)
      .patch(`/api/health-centres/${centreId}`)
      .set('Authorization', bearer(admin))
      .send({ hasAmbulance: false })
      .expect(200)
    expect(updated.body.data.centre.hasAmbulance).toBe(false)

    await request(app)
      .get('/api/health-centres?status=all')
      .set('Authorization', bearer(admin))
      .expect(200)
      .expect(({ body }) => expect(body.data.total).toBe(4))

    await request(app)
      .get(`/api/health-centres/${centreId}`)
      .set('Authorization', bearer(admin))
      .expect(200)

    const deleted = await request(app)
      .delete(`/api/health-centres/${centreId}`)
      .set('Authorization', bearer(admin))
      .expect(200)
    expect(deleted.body.data.centre.isActive).toBe(false)
    expect(await AuditLog.countDocuments({ resourceType: 'HealthCentre' })).toBe(3)
  })

  test('denies non-admin health centre management', async () => {
    await request(app)
      .post('/api/health-centres')
      .set('Authorization', bearer(patient))
      .send({
        name: 'Not allowed',
        type: 'PHC',
        address: 'No access',
        location: { type: 'Point', coordinates: [80.5, 16.5] },
      })
      .expect(403)
  })
})
