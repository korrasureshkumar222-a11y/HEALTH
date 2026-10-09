import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import Alert from '../src/models/Alert.js'
import AuditLog from '../src/models/AuditLog.js'
import Chw from '../src/models/Chw.js'
import HealthRecord from '../src/models/HealthRecord.js'
import Patient from '../src/models/Patient.js'
import User from '../src/models/User.js'
import { createAccessToken } from '../src/utils/tokenUtils.js'

let mongo
let patientUser
let otherPatientUser
let chwUser
let adminUser
let patient
let otherPatient

const patientId1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const patientId2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
const patientId3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'

async function createUser(role, phone) {
  return User.create({
    name: `${role} ${phone}`,
    phone,
    passwordHash: 'reading-test-password',
    role,
  })
}

function bearer(user) {
  return `Bearer ${createAccessToken(user)}`
}

function bpReading(clientId, overrides = {}) {
  return {
    type: 'bp',
    values: { systolic: 180, diastolic: 90, unit: 'mmHg' },
    recordedAt: '2026-10-06T12:00:00.000Z',
    clientId,
    ...overrides,
  }
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await Promise.all([
    User.init(),
    Patient.init(),
    Chw.init(),
    HealthRecord.init(),
    Alert.init(),
    AuditLog.init(),
  ])
})

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  )
  patientUser = await createUser('patient', '9876543210')
  otherPatientUser = await createUser('patient', '9876543211')
  chwUser = await createUser('chw', '9876543212')
  adminUser = await createUser('admin', '9876543213')
  await Chw.create({
    user: chwUser._id,
    employeeId: 'READING-CHW-1',
    assignedVillages: [{ village: 'Mangalagiri', mandal: 'Mangalagiri', district: 'Guntur' }],
  })
  patient = await Patient.create({
    user: patientUser._id,
    phone: patientUser.phone,
    village: 'Mangalagiri',
    mandal: 'Mangalagiri',
    district: 'Guntur',
  })
  otherPatient = await Patient.create({
    user: otherPatientUser._id,
    phone: otherPatientUser.phone,
    village: 'Tenali',
    district: 'Guntur',
  })
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('reading API', () => {
  test('classifies and stores a patient reading, then triggers a deduplicated alert', async () => {
    const response = await request(app)
      .post('/api/readings')
      .set('Authorization', bearer(patientUser))
      .send(bpReading(patientId1))
      .expect(201)

    expect(response.body.data.record).toMatchObject({
      patient: patient._id.toString(),
      recordedBy: patientUser._id.toString(),
      source: 'self',
      status: 'critical',
      classification: { rulesetVersion: 'demo-v1' },
    })
    expect(response.body.data.alert).toMatchObject({
      severity: 'critical',
      type: 'critical_reading',
      status: 'open',
    })
    expect(await HealthRecord.countDocuments()).toBe(1)
    expect(await Alert.countDocuments()).toBe(1)

    const duplicate = await request(app)
      .post('/api/readings')
      .set('Authorization', bearer(patientUser))
      .send(bpReading(patientId1))
      .expect(200)
    expect(duplicate.body.data.duplicate).toBe(true)
    expect(await HealthRecord.countDocuments()).toBe(1)
    expect(await Alert.countDocuments()).toBe(1)
  })

  test('creates a warning-severity alert for a warning reading', async () => {
    const response = await request(app)
      .post('/api/readings')
      .set('Authorization', bearer(patientUser))
      .send(bpReading(patientId1, {
        values: { systolic: 130, diastolic: 85, unit: 'mmHg' },
      }))
      .expect(201)

    expect(response.body.data.record.status).toBe('warning')
    expect(response.body.data.alert).toMatchObject({
      severity: 'warning',
      type: 'warning_reading',
    })
  })

  test('CHW can record only for an assigned-village patient and source is server-derived', async () => {
    const spoofedMetadata = await request(app)
      .post('/api/readings')
      .set('Authorization', bearer(patientUser))
      .send(bpReading(patientId3, {
        source: 'device',
        recordedBy: chwUser._id.toString(),
      }))
      .expect(400)
    expect(spoofedMetadata.body.error.code).toBe('VALIDATION_ERROR')

    const response = await request(app)
      .post('/api/readings')
      .set('Authorization', bearer(chwUser))
      .send(bpReading(patientId2, {
        patientId: patient._id.toString(),
        values: { systolic: 120, diastolic: 80, unit: 'mmHg' },
      }))
      .expect(201)
    expect(response.body.data.record.source).toBe('chw')
    expect(response.body.data.record.recordedBy).toBe(chwUser._id.toString())
    expect(response.body.data.record.status).toBe('normal')
    expect(response.body.data.alert).toBeNull()

    const denied = await request(app)
      .post('/api/readings')
      .set('Authorization', bearer(chwUser))
      .send(bpReading(patientId3, { patientId: otherPatient._id.toString() }))
      .expect(403)
    expect(denied.body.error.code).toBe('FORBIDDEN')
  })

  test('bulk sync accepts valid items, returns duplicates and reports invalid items per item', async () => {
    const response = await request(app)
      .post('/api/readings/bulk')
      .set('Authorization', bearer(patientUser))
      .send({
        batchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        items: [
          bpReading(patientId1, { values: { systolic: 120, diastolic: 80, unit: 'mmHg' } }),
          bpReading(patientId1, { values: { systolic: 120, diastolic: 80, unit: 'mmHg' } }),
          { clientId: 'bad-id', type: 'bp', values: {}, recordedAt: 'invalid-date' },
          bpReading(patientId2, { patientId: otherPatient._id.toString() }),
        ],
      })
      .expect(200)

    expect(response.body.data.results.map(({ outcome }) => outcome))
      .toEqual(['accepted', 'duplicate', 'rejected', 'rejected'])
    expect(response.body.data.results[2].error.code).toBe('VALIDATION_ERROR')
    expect(response.body.data.results[3].error.code).toBe('FORBIDDEN')
    expect(await HealthRecord.countDocuments()).toBe(1)
  })

  test('reading history supports date/type/status filters and stable pagination', async () => {
    await request(app)
      .post('/api/readings')
      .set('Authorization', bearer(patientUser))
      .send(bpReading(patientId1, {
        recordedAt: '2026-10-01T12:00:00.000Z',
        values: { systolic: 120, diastolic: 80, unit: 'mmHg' },
      }))
      .expect(201)
    await request(app)
      .post('/api/readings')
      .set('Authorization', bearer(patientUser))
      .send(bpReading(patientId3, {
        recordedAt: '2026-10-03T12:00:00.000Z',
        values: { systolic: 125, diastolic: 80, unit: 'mmHg' },
      }))
      .expect(201)
    await request(app)
      .post('/api/readings')
      .set('Authorization', bearer(patientUser))
      .send({
        type: 'heartRate',
        values: { value: 75, unit: 'bpm' },
        recordedAt: '2026-10-05T12:00:00.000Z',
        clientId: patientId2,
      })
      .expect(201)

    const page = await request(app)
      .get(`/api/readings/${patient._id}?from=2026-10-01T00:00:00.000Z&to=2026-10-06T23:59:59.000Z&type=bp&page=1&limit=1`)
      .set('Authorization', bearer(patientUser))
      .expect(200)
    expect(page.body.data).toMatchObject({ page: 1, limit: 1, total: 2, hasMore: true })
    expect(page.body.data.items[0].recordedAt).toBe('2026-10-03T12:00:00.000Z')

    const badRange = await request(app)
      .get(`/api/readings/${patient._id}?from=2026-10-07T00:00:00.000Z&to=2026-10-01T00:00:00.000Z`)
      .set('Authorization', bearer(patientUser))
      .expect(400)
    expect(badRange.body.error.code).toBe('VALIDATION_ERROR')
  })

  test('reading series returns daily blood pressure averages, extrema, and in-range percentage', async () => {
    const now = new Date()
    const date = (daysAgo) => new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysAgo,
      12,
    ))
    await HealthRecord.create([
      {
        patient: patient._id,
        type: 'bp',
        values: { systolic: 120, diastolic: 80, unit: 'mmHg' },
        recordedAt: date(1),
        recordedBy: patientUser._id,
        source: 'self',
        status: 'normal',
      },
      {
        patient: patient._id,
        type: 'bp',
        values: { systolic: 140, diastolic: 90, unit: 'mmHg' },
        recordedAt: date(1),
        recordedBy: patientUser._id,
        source: 'self',
        status: 'warning',
      },
      {
        patient: patient._id,
        type: 'bp',
        values: { systolic: 130, diastolic: 82, unit: 'mmHg' },
        recordedAt: date(3),
        recordedBy: patientUser._id,
        source: 'self',
        status: 'normal',
      },
      {
        patient: otherPatient._id,
        type: 'bp',
        values: { systolic: 190, diastolic: 130, unit: 'mmHg' },
        recordedAt: date(1),
        recordedBy: otherPatientUser._id,
        source: 'self',
        status: 'critical',
      },
    ])

    const response = await request(app)
      .get(`/api/readings/${patient._id}/series?type=bp&range=7d`)
      .set('Authorization', bearer(patientUser))
      .expect(200)

    expect(response.body.data.points).toHaveLength(2)
    const latestPoint = response.body.data.points[1]
    expect(latestPoint).toMatchObject({
      systolic: { average: 130, min: 120, max: 140 },
      diastolic: { average: 85, min: 80, max: 90 },
      count: 2,
    })
    expect(response.body.data.summary).toMatchObject({
      totalReadings: 3,
      classifiedReadings: 3,
      systolic: { average: 130, highest: 140, lowest: 120 },
      diastolic: { average: 84, highest: 90, lowest: 80 },
    })
    expect(response.body.data.summary.percentInRange).toBeCloseTo(66.67)

    await request(app)
      .get(`/api/readings/${otherPatient._id}/series?type=bp&range=7d`)
      .set('Authorization', bearer(patientUser))
      .expect(403)
    await request(app)
      .get(`/api/readings/${patient._id}/series?type=bp&range=365d`)
      .set('Authorization', bearer(patientUser))
      .expect(400)

    await HealthRecord.create({
      patient: patient._id,
      type: 'weight',
      values: { value: 62.4, unit: 'kg' },
      recordedAt: date(2),
      recordedBy: patientUser._id,
      source: 'self',
      status: 'unclassified',
    })
    const scalarSeries = await request(app)
      .get(`/api/readings/${patient._id}/series?type=weight&range=30d`)
      .set('Authorization', bearer(patientUser))
      .expect(200)
    expect(scalarSeries.body.data.points[0].value).toMatchObject({
      average: 62.4,
      min: 62.4,
      max: 62.4,
    })
    expect(scalarSeries.body.data.summary.percentInRange).toBeNull()
  })

  test('admin can delete a reading with a reason and the deletion is audited', async () => {
    const created = await request(app)
      .post('/api/readings')
      .set('Authorization', bearer(patientUser))
      .send(bpReading(patientId1))
      .expect(201)
    const recordId = created.body.data.record._id

    const denied = await request(app)
      .delete(`/api/readings/${patient._id}/${recordId}`)
      .set('Authorization', bearer(chwUser))
      .send({ reason: 'Duplicate entry' })
      .expect(403)
    expect(denied.body.error.code).toBe('FORBIDDEN')

    await request(app)
      .delete(`/api/readings/${patient._id}/${recordId}`)
      .set('Authorization', bearer(adminUser))
      .send({ reason: 'Duplicate entry confirmed by care team' })
      .expect(204)
    expect(await HealthRecord.countDocuments()).toBe(0)
    expect(await Alert.countDocuments()).toBe(0)
    expect(await AuditLog.findOne({ action: 'reading.delete' })).toMatchObject({
      actorRole: 'admin',
      reason: 'Duplicate entry confirmed by care team',
    })
  })

  test('rejects unsupported units and glucose values without context', async () => {
    const unsupportedUnit = await request(app)
      .post('/api/readings')
      .set('Authorization', bearer(patientUser))
      .send({
        type: 'heartRate',
        values: { value: 80, unit: 'mmHg' },
        recordedAt: '2026-10-06T12:00:00.000Z',
        clientId: patientId1,
      })
      .expect(400)
    expect(unsupportedUnit.body.error.code).toBe('VALIDATION_ERROR')

    const missingContext = await request(app)
      .post('/api/readings')
      .set('Authorization', bearer(patientUser))
      .send({
        type: 'sugar',
        values: { value: 100, unit: 'mg/dL' },
        recordedAt: '2026-10-06T12:00:00.000Z',
        clientId: patientId2,
      })
      .expect(400)
    expect(missingContext.body.error.code).toBe('VALIDATION_ERROR')
  })
})
