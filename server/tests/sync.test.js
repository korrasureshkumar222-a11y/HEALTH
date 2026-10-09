import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import Alert from '../src/models/Alert.js'
import AuditLog from '../src/models/AuditLog.js'
import HealthRecord from '../src/models/HealthRecord.js'
import Patient from '../src/models/Patient.js'
import SyncReceipt from '../src/models/SyncReceipt.js'
import User from '../src/models/User.js'
import { createAccessToken } from '../src/utils/tokenUtils.js'

let mongo
let patientUser
let patient

function bearer(user) {
  return `Bearer ${createAccessToken(user)}`
}

async function createUser(role, phone) {
  return User.create({
    name: `${role} ${phone}`,
    phone,
    passwordHash: 'sync-test-password',
    role,
  })
}

function readingItem(clientId, overrides = {}) {
  return {
    clientId,
    type: 'reading',
    clientTimestamp: '2026-10-06T12:00:00.000Z',
    payload: {
      type: 'bp',
      values: { systolic: 120, diastolic: 80, unit: 'mmHg' },
      recordedAt: '2026-10-06T12:00:00.000Z',
    },
    ...overrides,
  }
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await Promise.all([
    Alert.init(),
    AuditLog.init(),
    HealthRecord.init(),
    Patient.init(),
    SyncReceipt.init(),
    User.init(),
  ])
})

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})))
  patientUser = await createUser('patient', '9876543210')
  patient = await Patient.create({
    user: patientUser._id,
    phone: patientUser.phone,
    village: 'Mangalagiri',
    district: 'Guntur',
    status: 'active',
  })
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('offline sync API', () => {
  test('requires authentication', async () => {
    await request(app).post('/api/sync').send({ items: [readingItem('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')] }).expect(401)
  })

  test('deduplicates repeated client IDs within and across batches', async () => {
    const item = readingItem('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', {
      payload: {
        patientId: patient._id.toString(),
        type: 'bp',
        values: { systolic: 120, diastolic: 80, unit: 'mmHg' },
        recordedAt: '2026-10-06T12:00:00.000Z',
      },
    })
    const first = await request(app)
      .post('/api/sync')
      .set('Authorization', bearer(patientUser))
      .send({ items: [item, item] })
      .expect(200)
    expect(first.body.data.results.map(({ outcome }) => outcome)).toEqual(['accepted', 'duplicate'])
    await request(app)
      .post('/api/sync')
      .set('Authorization', bearer(patientUser))
      .send({ items: [item] })
      .expect(200)
      .expect(({ body }) => expect(body.data.results[0].outcome).toBe('duplicate'))
    expect(await HealthRecord.countDocuments()).toBe(1)
    expect(await SyncReceipt.countDocuments()).toBe(1)
  })

  test('isolates validation failures and continues processing valid items', async () => {
    const valid = readingItem('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', {
      payload: {
        patientId: patient._id.toString(),
        type: 'bp',
        values: { systolic: 120, diastolic: 80, unit: 'mmHg' },
        recordedAt: '2026-10-06T12:00:00.000Z',
      },
    })
    const invalid = readingItem('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', {
      payload: { type: 'unknown', values: {}, recordedAt: 'not-a-date' },
    })
    const malformedEnvelope = { type: 'reading', payload: {} }
    const response = await request(app)
      .post('/api/sync')
      .set('Authorization', bearer(patientUser))
      .send({ items: [malformedEnvelope, invalid, valid] })
      .expect(200)
    expect(response.body.data.results.map(({ outcome }) => outcome)).toEqual(['rejected', 'rejected', 'accepted'])
    expect(await HealthRecord.countDocuments()).toBe(1)
  })

  test('rejects a repeated client ID with a different item type', async () => {
    const clientId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'
    const first = readingItem(clientId, {
      payload: {
        patientId: patient._id.toString(),
        type: 'bp',
        values: { systolic: 120, diastolic: 80, unit: 'mmHg' },
        recordedAt: '2026-10-06T12:00:00.000Z',
      },
    })
    await request(app).post('/api/sync').set('Authorization', bearer(patientUser)).send({ items: [first] }).expect(200)
    const response = await request(app)
      .post('/api/sync')
      .set('Authorization', bearer(patientUser))
      .send({ items: [{ ...first, type: 'patient.update', payload: { patientId: patient._id.toString(), changes: {} } }] })
      .expect(200)
    expect(response.body.data.results[0].error.code).toBe('CLIENT_ID_CONFLICT')
  })
})
