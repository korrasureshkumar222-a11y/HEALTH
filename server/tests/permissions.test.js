import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import Chw from '../src/models/Chw.js'
import Doctor from '../src/models/Doctor.js'
import HealthRecord from '../src/models/HealthRecord.js'
import Patient from '../src/models/Patient.js'
import User from '../src/models/User.js'
import { createAccessToken } from '../src/utils/tokenUtils.js'
import { canAccessPatient } from '../src/services/permissions.js'

let mongo
let owner
let patient
let reading
let doctorUser
let chwUser

async function createUser(role, phone) {
  return User.create({
    name: `${role} ${phone}`,
    phone,
    passwordHash: 'permission-test-password',
    role,
  })
}

function auth(user) {
  return `Bearer ${createAccessToken(user)}`
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await Promise.all([
    User.init(),
    Patient.init(),
    Doctor.init(),
    Chw.init(),
    HealthRecord.init(),
  ])
})

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  )

  owner = await createUser('patient', '9876543210')
  doctorUser = await createUser('doctor', '9876543211')
  chwUser = await createUser('chw', '9876543212')
  const doctorProfile = await Doctor.create({
    user: doctorUser._id,
    specialization: 'General Medicine',
    registrationNo: 'RBAC-DOCTOR-1',
  })
  await Chw.create({
    user: chwUser._id,
    employeeId: 'RBAC-CHW-1',
    assignedVillages: [{ village: 'Mangalagiri', mandal: 'Mangalagiri', district: 'Guntur' }],
  })
  patient = await Patient.create({
    user: owner._id,
    village: 'Mangalagiri',
    mandal: 'Mangalagiri',
    district: 'Guntur',
    assignedDoctor: doctorProfile._id,
  })
  reading = await HealthRecord.create({
    patient: patient._id,
    type: 'bp',
    values: { systolic: 120, diastolic: 80, unit: 'mmHg' },
    recordedAt: new Date('2026-10-01T10:00:00.000Z'),
    recordedBy: owner._id,
    source: 'self',
  })
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('patient and reading access control', () => {
  test('patients can read their own profile and readings but not another patient', async () => {
    const otherUser = await createUser('patient', '9876543213')
    const otherPatient = await Patient.create({
      user: otherUser._id,
      village: 'Tenali',
    })

    await request(app)
      .get(`/api/patients/${patient._id}`)
      .set('Authorization', auth(owner))
      .expect(200)
    await request(app)
      .get(`/api/readings/${patient._id}`)
      .set('Authorization', auth(owner))
      .expect(200)

    const denied = await request(app)
      .get(`/api/patients/${otherPatient._id}`)
      .set('Authorization', auth(owner))
      .expect(403)
    expect(denied.body.error.code).toBe('FORBIDDEN')

    const deniedReading = await request(app)
      .get(`/api/readings/${otherPatient._id}/${reading._id}`)
      .set('Authorization', auth(owner))
      .expect(403)
    expect(deniedReading.body.error.code).toBe('FORBIDDEN')
  })

  test('doctors can read assigned patients and are forbidden from unassigned patients', async () => {
    const unassignedUser = await createUser('patient', '9876543214')
    const unassignedPatient = await Patient.create({
      user: unassignedUser._id,
      village: 'Tenali',
    })

    await request(app)
      .get(`/api/readings/${patient._id}/${reading._id}`)
      .set('Authorization', auth(doctorUser))
      .expect(200)

    const denied = await request(app)
      .get(`/api/patients/${unassignedPatient._id}`)
      .set('Authorization', auth(doctorUser))
      .expect(403)
    expect(denied.body.error.code).toBe('FORBIDDEN')
  })

  test('CHWs can access assigned villages case-insensitively but not other villages', async () => {
    patient.village = 'mAnGaLaGiRi'
    await patient.save()
    const inScope = await canAccessPatient(chwUser, patient._id)
    expect(inScope).toBe(true)

    await request(app)
      .get(`/api/patients/${patient._id}`)
      .set('Authorization', auth(chwUser))
      .expect(200)

    const otherUser = await createUser('patient', '9876543215')
    const otherPatient = await Patient.create({
      user: otherUser._id,
      village: 'Tenali',
      mandal: 'Tenali',
      district: 'Guntur',
    })

    const denied = await request(app)
      .get(`/api/readings/${otherPatient._id}`)
      .set('Authorization', auth(chwUser))
      .expect(403)
    expect(denied.body.error.code).toBe('FORBIDDEN')
  })

  test('admins can read all patient and reading records', async () => {
    const admin = await createUser('admin', '9876543216')

    await request(app)
      .get(`/api/patients/${patient._id}`)
      .set('Authorization', auth(admin))
      .expect(200)
    const response = await request(app)
      .get(`/api/readings/${patient._id}/${reading._id}`)
      .set('Authorization', auth(admin))
      .expect(200)

    expect(response.body.data.record._id).toBe(reading._id.toString())
  })

  test('rejects requests without authentication before evaluating patient scope', async () => {
    const response = await request(app)
      .get(`/api/patients/${patient._id}`)
      .expect(401)
    expect(response.body.error.code).toBe('ACCESS_TOKEN_MISSING')
  })
})
