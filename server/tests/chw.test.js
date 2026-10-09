import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import Alert from '../src/models/Alert.js'
import Chw from '../src/models/Chw.js'
import HealthRecord from '../src/models/HealthRecord.js'
import Patient from '../src/models/Patient.js'
import User from '../src/models/User.js'
import VisitLog from '../src/models/VisitLog.js'
import { createAccessToken } from '../src/utils/tokenUtils.js'

let mongo
let chwUser
let otherChwUser
let patient

function bearer(user) {
  return `Bearer ${createAccessToken(user)}`
}

async function createUser(role, phone) {
  return User.create({ name: `${role} ${phone}`, phone, passwordHash: 'chw-test-password', role })
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await Promise.all([
    Alert.init(),
    Chw.init(),
    HealthRecord.init(),
    Patient.init(),
    User.init(),
    VisitLog.init(),
  ])
})

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})))
  chwUser = await createUser('chw', '9876543201')
  otherChwUser = await createUser('chw', '9876543202')
  const patientUser = await createUser('patient', '9876543203')
  await Chw.create({
    user: chwUser._id,
    employeeId: 'CHW-TEST-1',
    assignedVillages: [{ village: 'Mangalagiri', mandal: 'Mangalagiri', district: 'Guntur' }],
  })
  await Chw.create({
    user: otherChwUser._id,
    employeeId: 'CHW-TEST-2',
    assignedVillages: [{ village: 'Tenali', district: 'Guntur' }],
  })
  patient = await Patient.create({
    user: patientUser._id,
    phone: patientUser.phone,
    name: patientUser.name,
    village: 'Mangalagiri',
    mandal: 'Mangalagiri',
    district: 'Guntur',
    status: 'active',
  })
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('CHW module', () => {
  test('serves village-scoped dashboard patients and pending readings', async () => {
    const response = await request(app)
      .get('/api/dashboard/chw')
      .set('Authorization', bearer(chwUser))
      .expect(200)

    expect(response.body.data.villages).toMatchObject([{
      village: 'Mangalagiri',
      patientCount: 1,
      pendingReadings: 1,
    }])
    expect(response.body.data.patients[0]).toMatchObject({
      _id: patient._id.toString(),
      pendingReadingToday: true,
    })
    await request(app)
      .get('/api/dashboard/chw')
      .set('Authorization', bearer(otherChwUser))
      .expect(({ body }) => expect(body.data.patients).toHaveLength(0))
  })

  test('creates visit log with checklist and GPS and denies cross-village visits', async () => {
    const input = {
      clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      patientId: patient._id.toString(),
      date: new Date().toISOString(),
      status: 'completed',
      checklist: ['vitals', 'medications'],
      notes: 'BP checked and medication reviewed.',
      location: { type: 'Point', coordinates: [80.42, 16.43] },
    }
    const response = await request(app)
      .post('/api/chw/visits')
      .set('Authorization', bearer(chwUser))
      .send(input)
      .expect(201)
    expect(response.body.data.visit).toMatchObject({
      chw: expect.any(String),
      patient: patient._id.toString(),
      status: 'completed',
      checklist: ['vitals', 'medications'],
      location: { coordinates: [80.42, 16.43] },
    })
    await request(app)
      .post('/api/chw/visits')
      .set('Authorization', bearer(otherChwUser))
      .send({ ...input, clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2' })
      .expect(403)
    expect(await VisitLog.countDocuments()).toBe(1)
  })

  test('deduplicates visits by client ID and returns weekly performance', async () => {
    const input = {
      clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      patientId: patient._id.toString(),
      date: new Date().toISOString(),
      status: 'completed',
      checklist: ['education'],
    }
    const first = await request(app)
      .post('/api/chw/visits')
      .set('Authorization', bearer(chwUser))
      .send(input)
      .expect(201)
    const retry = await request(app)
      .post('/api/chw/visits')
      .set('Authorization', bearer(chwUser))
      .send(input)
      .expect(200)
    expect(retry.body.data.visit._id).toBe(first.body.data.visit._id)
    const performance = await request(app)
      .get('/api/dashboard/chw/performance')
      .set('Authorization', bearer(chwUser))
      .expect(200)
    expect(performance.body.data.patientsCovered).toBe(1)
  })

  test('restricts CHW dashboard access by role', async () => {
    const patientUser = await createUser('patient', '9876543204')
    await request(app)
      .get('/api/dashboard/chw')
      .set('Authorization', bearer(patientUser))
      .expect(403)
  })
})
