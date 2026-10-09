import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import Alert from '../src/models/Alert.js'
import AuditLog from '../src/models/AuditLog.js'
import Chw from '../src/models/Chw.js'
import Doctor from '../src/models/Doctor.js'
import HealthCentre from '../src/models/HealthCentre.js'
import Notification from '../src/models/Notification.js'
import Patient from '../src/models/Patient.js'
import SosIncident from '../src/models/SosIncident.js'
import User from '../src/models/User.js'
import { createAccessToken } from '../src/utils/tokenUtils.js'

let mongo
let patientUser
let doctorUser
let chwUser
let adminUser
let otherUser
let patient
let doctor

async function createUser(role, phone) {
  return User.create({
    name: `${role} ${phone}`,
    phone,
    passwordHash: 'sos-test-password',
    role,
  })
}

function bearer(user) {
  return `Bearer ${createAccessToken(user)}`
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await Promise.all([
    Alert.init(),
    AuditLog.init(),
    Chw.init(),
    Doctor.init(),
    HealthCentre.init(),
    Notification.init(),
    Patient.init(),
    SosIncident.init(),
    User.init(),
  ])
})

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  )
  patientUser = await createUser('patient', '9876543100')
  doctorUser = await createUser('doctor', '9876543101')
  chwUser = await createUser('chw', '9876543102')
  adminUser = await createUser('admin', '9876543103')
  otherUser = await createUser('patient', '9876543104')
  doctor = await Doctor.create({
    user: doctorUser._id,
    specialization: 'Emergency Medicine',
    registrationNo: 'SOS-DOCTOR-1',
  })
  const chw = await Chw.create({
    user: chwUser._id,
    employeeId: 'SOS-CHW-1',
    assignedVillages: [{ village: 'Mangalagiri', mandal: 'Mangalagiri', district: 'Guntur' }],
  })
  patient = await Patient.create({
    user: patientUser._id,
    phone: patientUser.phone,
    name: patientUser.name,
    village: 'Mangalagiri',
    mandal: 'Mangalagiri',
    district: 'Guntur',
    location: { type: 'Point', coordinates: [80.42, 16.43] },
    emergencyContacts: [
      { name: 'Family', phone: '9876543199', consentToContact: true },
      { name: 'No consent', phone: '9876543198', consentToContact: false },
    ],
    assignedDoctor: doctor._id,
    assignedChw: chw._id,
  })
  await Patient.create({
    user: otherUser._id,
    phone: otherUser.phone,
    village: 'Tenali',
    district: 'Guntur',
  })
  await HealthCentre.create([
    {
      name: 'Near PHC',
      type: 'PHC',
      address: 'Near village',
      phone: '08612345678',
      hasAmbulance: true,
      location: { type: 'Point', coordinates: [80.421, 16.43] },
    },
    {
      name: 'Second PHC',
      type: 'PHC',
      address: 'District road',
      location: { type: 'Point', coordinates: [80.45, 16.43] },
    },
    {
      name: 'Third CHC',
      type: 'CHC',
      address: 'Mandal centre',
      location: { type: 'Point', coordinates: [80.40, 16.45] },
    },
    {
      name: 'Far Hospital',
      type: 'districtHospital',
      address: 'Far away',
      location: { type: 'Point', coordinates: [81.0, 17.0] },
    },
  ])
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('SOS API', () => {
  test('allows a CHW to trigger SOS for an assigned-village patient', async () => {
    const response = await request(app)
      .post('/api/sos')
      .set('Authorization', bearer(chwUser))
      .send({
        clientId: 'e81c8454-6000-4f20-b788-ce2425733942',
        patientId: patient._id.toString(),
      })
      .expect(201)

    expect(response.body.data.incident).toMatchObject({
      patient: patient._id.toString(),
      triggeredBy: chwUser._id.toString(),
      location: {
        type: 'Point',
        coordinates: [80.42, 16.43],
      },
    })
  })

  test('uses saved patient location, creates a critical alert and returns the three nearest centres', async () => {
    const response = await request(app)
      .post('/api/sos')
      .set('Authorization', bearer(patientUser))
      .send({ clientId: 'e81c8454-6000-4f20-b788-ce2425733941' })
      .expect(201)

    expect(response.body.data.incident).toMatchObject({
      patient: patient._id.toString(),
      status: 'chwNotified',
      location: { type: 'Point', coordinates: [80.42, 16.43] },
    })
    expect(response.body.data.incident.timeline.map(({ status }) => status))
      .toEqual(['triggered', 'doctorNotified', 'chwNotified'])
    expect(response.body.data.nearestHealthCentres).toHaveLength(3)
    expect(response.body.data.nearestHealthCentres[0]).toMatchObject({
      name: 'Near PHC',
      distanceKm: expect.any(Number),
    })
    expect(response.body.data.emergencySms).toMatchObject({
      body: expect.stringContaining('maps.google.com/?q=16.43,80.42'),
    })
    expect(response.body.data.emergencySms.recipients).toEqual(expect.arrayContaining([
      '9876543199',
      doctorUser.phone,
      chwUser.phone,
    ]))
    expect(await Alert.countDocuments({
      patient: patient._id,
      type: 'sos',
      severity: 'critical',
      sosIncident: response.body.data.incident._id,
    })).toBe(1)
    expect(await Notification.countDocuments({
      user: { $in: [doctorUser._id, chwUser._id] },
      type: 'sos_update',
    })).toBe(2)
  })

  test('accepts a GPS location and returns the same incident for an idempotent retry', async () => {
    const input = {
      clientId: 'f81c8454-6000-4f20-b788-ce2425733941',
      location: { type: 'Point', coordinates: [80.5, 16.5] },
    }
    const created = await request(app)
      .post('/api/sos')
      .set('Authorization', bearer(patientUser))
      .send(input)
      .expect(201)
    const retry = await request(app)
      .post('/api/sos')
      .set('Authorization', bearer(patientUser))
      .send(input)
      .expect(200)
    expect(retry.body.data.duplicate).toBe(true)
    expect(retry.body.data.incident._id).toBe(created.body.data.incident._id)
    expect(await SosIncident.countDocuments()).toBe(1)
    expect(await Alert.countDocuments({ type: 'sos' })).toBe(1)
    expect(await Notification.countDocuments({ type: 'sos_update' })).toBe(2)
  })

  test('requires a saved or GPS location and validates coordinate ranges', async () => {
    patient.location = undefined
    await patient.save()
    const noLocation = await request(app)
      .post('/api/sos')
      .set('Authorization', bearer(patientUser))
      .send({ clientId: 'a81c8454-6000-4f20-b788-ce2425733941' })
      .expect(400)
    expect(noLocation.body.error.code).toBe('SOS_LOCATION_REQUIRED')

    await request(app)
      .post('/api/sos')
      .set('Authorization', bearer(patientUser))
      .send({
        clientId: 'b81c8454-6000-4f20-b788-ce2425733941',
        location: { type: 'Point', coordinates: [200, 16] },
      })
      .expect(400)
  })

  test('scopes incident reads and applies role-checked status transitions', async () => {
    const created = await request(app)
      .post('/api/sos')
      .set('Authorization', bearer(patientUser))
      .send({ clientId: 'c81c8454-6000-4f20-b788-ce2425733941' })
      .expect(201)
    const id = created.body.data.incident._id

    await request(app)
      .get(`/api/sos/${id}`)
      .set('Authorization', bearer(otherUser))
      .expect(403)

    const ambulanceRequested = await request(app)
      .patch(`/api/sos/${id}/status`)
      .set('Authorization', bearer(doctorUser))
      .send({ status: 'ambulanceRequested', note: 'Called emergency dispatch.' })
      .expect(200)
    expect(ambulanceRequested.body.data.incident.status).toBe('ambulanceRequested')

    await request(app)
      .patch(`/api/sos/${id}/status`)
      .set('Authorization', bearer(chwUser))
      .send({ status: 'resolved', note: 'Not authorized to resolve.' })
      .expect(403)

    const resolved = await request(app)
      .patch(`/api/sos/${id}/status`)
      .set('Authorization', bearer(adminUser))
      .send({ status: 'resolved', note: 'Emergency support completed.' })
      .expect(200)
    expect(resolved.body.data.incident).toMatchObject({
      status: 'resolved',
      resolvedBy: adminUser._id.toString(),
    })
    expect(await Alert.findOne({ sosIncident: id })).toMatchObject({ status: 'resolved' })
    expect(await AuditLog.countDocuments({ action: 'sos.status' })).toBe(2)

    await request(app)
      .patch(`/api/sos/${id}/status`)
      .set('Authorization', bearer(adminUser))
      .send({ status: 'ambulanceRequested' })
      .expect(409)
  })
})
