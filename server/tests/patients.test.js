import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import AuditLog from '../src/models/AuditLog.js'
import Chw from '../src/models/Chw.js'
import Doctor from '../src/models/Doctor.js'
import HealthCentre from '../src/models/HealthCentre.js'
import HealthRecord from '../src/models/HealthRecord.js'
import Patient from '../src/models/Patient.js'
import User from '../src/models/User.js'
import { createAccessToken } from '../src/utils/tokenUtils.js'

let mongo
let patientUser
let doctorUser
let chwUser
let adminUser
let doctorProfile
let chwProfile
let patient
let healthCentre

async function createUser(role, phone, name = `${role} ${phone}`) {
  return User.create({ name, phone, passwordHash: 'patient-module-password', role })
}

function bearer(user) {
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
    HealthCentre.init(),
    HealthRecord.init(),
    AuditLog.init(),
  ])
})

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  )
  patientUser = await createUser('patient', '9876543210', 'Ravi Kumar')
  doctorUser = await createUser('doctor', '9876543211', 'Dr Rao')
  chwUser = await createUser('chw', '9876543212', 'Lakshmi CHW')
  adminUser = await createUser('admin', '9876543213', 'System Admin')
  doctorProfile = await Doctor.create({
    user: doctorUser._id,
    specialization: 'General Medicine',
    registrationNo: 'PATIENT-DOCTOR-1',
  })
  chwProfile = await Chw.create({
    user: chwUser._id,
    employeeId: 'PATIENT-CHW-1',
    assignedVillages: [{ village: 'Mangalagiri', mandal: 'Mangalagiri', district: 'Guntur' }],
  })
  patient = await Patient.create({
    user: patientUser._id,
    name: patientUser.name,
    phone: patientUser.phone,
    village: 'Mangalagiri',
    mandal: 'Mangalagiri',
    district: 'Guntur',
    conditions: ['diabetes'],
    assignedDoctor: doctorProfile._id,
    assignedChw: chwProfile._id,
    location: { type: 'Point', coordinates: [80.64, 16.24] },
  })
  healthCentre = await HealthCentre.create({
    name: 'Mangalagiri PHC',
    type: 'PHC',
    address: 'Main road, Mangalagiri',
    location: { type: 'Point', coordinates: [80.65, 16.25] },
  })
  await HealthRecord.create({
    patient: patient._id,
    type: 'bp',
    values: { systolic: 160, diastolic: 100, unit: 'mmHg' },
    recordedAt: new Date('2026-10-01T10:00:00.000Z'),
    recordedBy: patientUser._id,
    source: 'self',
    status: 'critical',
  })
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('patient module API', () => {
  test('encrypts emergency contacts at rest and decrypts document and lean reads', async () => {
    const contacts = [{ name: 'Mina Devi', phone: '9876543299', relation: 'sister' }]
    patient.emergencyContacts = contacts
    await patient.save()

    const stored = await Patient.collection.findOne({ _id: patient._id })
    expect(stored.emergencyContacts).toMatch(/^enc:v1:/)

    const document = await Patient.findById(patient._id).select('+emergencyContacts')
    expect(document.emergencyContacts).toEqual(contacts)
    expect(document.toJSON().emergencyContacts).toEqual(contacts)

    const lean = await Patient.findById(patient._id).lean()
    expect(lean.emergencyContacts).toEqual(contacts)
  })

  test('registers a CHW patient profile in-scope and auto-links the nearest centre', async () => {
    const response = await request(app)
      .post('/api/patients')
      .set('Authorization', bearer(chwUser))
      .send({
        name: 'Sita Devi',
        phone: '9876543220',
        village: 'Mangalagiri',
        mandal: 'Mangalagiri',
        district: 'Guntur',
        age: 52,
        conditions: ['hypertension'],
        location: { type: 'Point', coordinates: [80.641, 16.241] },
        consent: { accepted: true, policyVersion: 'test-policy-v1' },
      })
      .expect(201)

    expect(response.body.data.patient).toMatchObject({
      name: 'Sita Devi',
      phone: '9876543220',
      village: 'Mangalagiri',
      assignedChw: chwProfile._id.toString(),
      nearestHealthCentre: healthCentre._id.toString(),
    })
    expect(await User.findOne({ phone: '9876543220' })).toBeNull()
    expect(await AuditLog.findOne({ action: 'patient.create' })).toMatchObject({
      actorRole: 'chw',
      changedFields: expect.arrayContaining(['name', 'phone', 'village']),
    })
  })

  test('resolves the authenticated patient profile and restricts assignable staff lookup', async () => {
    const ownProfile = await request(app)
      .get('/api/patients/me')
      .set('Authorization', bearer(patientUser))
      .expect(200)
    expect(ownProfile.body.data.patient._id).toBe(patient._id.toString())

    const denied = await request(app)
      .get('/api/patients/assignables')
      .set('Authorization', bearer(doctorUser))
      .expect(403)
    expect(denied.body.error.code).toBe('FORBIDDEN')

    const assignables = await request(app)
      .get('/api/patients/assignables')
      .set('Authorization', bearer(adminUser))
      .expect(200)
    expect(assignables.body.data.doctors).toHaveLength(1)
    expect(assignables.body.data.chws).toHaveLength(1)
  })

  test('rejects CHW patient creation outside assigned villages', async () => {
    const response = await request(app)
      .post('/api/patients')
      .set('Authorization', bearer(chwUser))
      .send({
        name: 'Other Village Patient',
        phone: '9876543221',
        village: 'Tenali',
        district: 'Guntur',
        consent: { accepted: true, policyVersion: 'test-policy-v1' },
      })
      .expect(403)

    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(await Patient.findOne({ phone: '9876543221' })).toBeNull()
  })

  test('paginates, searches, and filters by condition and latest reading risk', async () => {
    const secondUser = await createUser('patient', '9876543222', 'Sita Reddy')
    await Patient.create({
      user: secondUser._id,
      name: secondUser.name,
      phone: secondUser.phone,
      village: 'Mangalagiri',
      mandal: 'Mangalagiri',
      district: 'Guntur',
      conditions: ['hypertension'],
      assignedDoctor: doctorProfile._id,
    })
    const doctorToken = bearer(doctorUser)

    const search = await request(app)
      .get('/api/patients?search=Ravi&page=1&limit=1&condition=diabetes&risk=critical')
      .set('Authorization', doctorToken)
      .expect(200)
    expect(search.body.data).toMatchObject({ total: 1, page: 1, limit: 1, hasMore: false })
    expect(search.body.data.items[0].name).toBe('Ravi Kumar')
    expect(search.body.data.items[0].latestReading.status).toBe('critical')

    const phoneSearch = await request(app)
      .get('/api/patients?q=9876543210')
      .set('Authorization', doctorToken)
      .expect(200)
    expect(phoneSearch.body.data.items[0].phone).toBe('9876543210')

    const villageSearch = await request(app)
      .get('/api/patients?village=Mangalagiri&condition=hypertension')
      .set('Authorization', bearer(chwUser))
      .expect(200)
    expect(villageSearch.body.data.total).toBe(1)
    expect(villageSearch.body.data.items[0].name).toBe('Sita Reddy')

    const forbiddenPatient = await createUser('patient', '9876543223')
    await Patient.create({
      user: forbiddenPatient._id,
      phone: forbiddenPatient.phone,
      village: 'Tenali',
    })
    const chwList = await request(app)
      .get('/api/patients')
      .set('Authorization', bearer(chwUser))
      .expect(200)
    expect(chwList.body.data.items.map(({ village }) => village))
      .toEqual(expect.arrayContaining(['Mangalagiri']))
    expect(chwList.body.data.items.some(({ village }) => village === 'Tenali')).toBe(false)
  })

  test('updates a scoped profile and records an audit event', async () => {
    const response = await request(app)
      .patch(`/api/patients/${patient._id}`)
      .set('Authorization', bearer(chwUser))
      .send({ age: 61, allergies: [{ name: 'Penicillin', notes: 'Rash' }] })
      .expect(200)

    expect(response.body.data.patient.age).toBe(61)
    expect(response.body.data.patient.allergies[0].name).toBe('Penicillin')
    expect(await AuditLog.findOne({ action: 'patient.update' })).toMatchObject({
      actorRole: 'chw',
      changedFields: expect.arrayContaining(['age', 'allergies']),
    })
  })

  test('restricts patient self-service updates to approved fields', async () => {
    const response = await request(app)
      .patch(`/api/patients/${patient._id}`)
      .set('Authorization', bearer(patientUser))
      .send({ conditions: ['cardiac'] })
      .expect(403)
    expect(response.body.error.code).toBe('FORBIDDEN')
    expect((await Patient.findById(patient._id)).conditions).toEqual(['diabetes'])
  })

  test('allows only admins to assign doctor and CHW profiles', async () => {
    const forbidden = await request(app)
      .patch(`/api/patients/${patient._id}/assignments`)
      .set('Authorization', bearer(doctorUser))
      .send({ doctorId: null })
      .expect(403)
    expect(forbidden.body.error.code).toBe('FORBIDDEN')

    const assigned = await request(app)
      .patch(`/api/patients/${patient._id}/assignments`)
      .set('Authorization', bearer(adminUser))
      .send({ doctorId: null, chwId: null })
      .expect(200)
    expect(assigned.body.data.patient.assignedDoctor).toBeNull()
    expect(assigned.body.data.patient.assignedChw).toBeNull()
    expect(await AuditLog.findOne({ action: 'patient.assign' })).not.toBeNull()
  })

  test('deactivates a patient and disables the linked account', async () => {
    const response = await request(app)
      .post(`/api/patients/${patient._id}/deactivate`)
      .set('Authorization', bearer(adminUser))
      .expect(200)

    expect(response.body.data.patient.status).toBe('inactive')
    expect((await User.findById(patientUser._id)).isActive).toBe(false)
    expect(await AuditLog.findOne({ action: 'patient.deactivate' })).not.toBeNull()

    await request(app)
      .get(`/api/patients/${patient._id}`)
      .set('Authorization', bearer(doctorUser))
      .expect(403)
    await request(app)
      .get('/api/patients?status=inactive')
      .set('Authorization', bearer(doctorUser))
      .expect(403)
    const adminList = await request(app)
      .get('/api/patients?status=inactive')
      .set('Authorization', bearer(adminUser))
      .expect(200)
    expect(adminList.body.data.items.map(({ _id }) => _id)).toContain(patient._id.toString())
  })

  test('links a pending CHW profile when the patient completes public registration', async () => {
    const pending = await Patient.create({
      name: 'Pending Sita',
      phone: '9876543224',
      village: 'Mangalagiri',
      district: 'Guntur',
      assignedChw: chwProfile._id,
    })
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Sita Devi',
        phone: '9876543224',
        password: 'patient-password-123',
        village: 'Mangalagiri',
        district: 'Guntur',
        consent: { accepted: true, policyVersion: 'test-policy-v1' },
      })
      .expect(201)

    const linked = await Patient.findById(pending._id)
    expect(linked.user.toString()).toBe(response.body.data.user.id)
    expect(linked.name).toBe('Sita Devi')
    expect(await Patient.countDocuments({ phone: '9876543224' })).toBe(1)
  })
})
