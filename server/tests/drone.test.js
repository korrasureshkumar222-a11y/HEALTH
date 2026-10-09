import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import AuditLog from '../src/models/AuditLog.js'
import Chw from '../src/models/Chw.js'
import Doctor from '../src/models/Doctor.js'
import DroneMission from '../src/models/DroneMission.js'
import HealthCentre from '../src/models/HealthCentre.js'
import LandingPoint from '../src/models/LandingPoint.js'
import Notification from '../src/models/Notification.js'
import Patient from '../src/models/Patient.js'
import SmsLog from '../src/models/SmsLog.js'
import SosIncident from '../src/models/SosIncident.js'
import User from '../src/models/User.js'
import {
  configureDroneAdapters,
} from '../src/services/droneMissionService.js'
import {
  MockDroneProvider,
  MockSmsProvider,
  MockWeatherProvider,
} from '../src/services/droneProviders.js'
import { createAccessToken } from '../src/utils/tokenUtils.js'

let mongo
let patientUser
let doctorUser
let adminUser
let chwUser
let otherDoctorUser
let doctor
let patient
let incident
let safeLandingPoint

async function createUser(role, phone) {
  return User.create({ name: `${role} ${phone}`, phone, passwordHash: 'drone-test-password', role })
}

function bearer(user) {
  return `Bearer ${createAccessToken(user)}`
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await Promise.all([
    User.init(),
    Doctor.init(),
    Chw.init(),
    Patient.init(),
    HealthCentre.init(),
    LandingPoint.init(),
    SosIncident.init(),
    DroneMission.init(),
    SmsLog.init(),
    Notification.init(),
    AuditLog.init(),
  ])
})

beforeEach(async () => {
  configureDroneAdapters({
    drone: new MockDroneProvider(),
    weather: new MockWeatherProvider(),
    sms: new MockSmsProvider(),
  })
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  )
  patientUser = await createUser('patient', '9876501101')
  doctorUser = await createUser('doctor', '9876501102')
  adminUser = await createUser('admin', '9876501103')
  otherDoctorUser = await createUser('doctor', '9876501104')
  chwUser = await createUser('chw', '9876501106')
  await Chw.create({
    user: chwUser._id,
    employeeId: 'DRONE-CHW-1',
    assignedVillages: [{ village: 'Test Village', mandal: 'Test Mandal', district: 'Test District' }],
  })
  doctor = await Doctor.create({
    user: doctorUser._id,
    specialization: 'Emergency Medicine',
    registrationNo: 'DRONE-DOCTOR-1',
  })
  const otherDoctor = await Doctor.create({
    user: otherDoctorUser._id,
    specialization: 'General Medicine',
    registrationNo: 'DRONE-DOCTOR-2',
  })
  patient = await Patient.create({
    user: patientUser._id,
    name: 'Drone Test Patient',
    phone: patientUser.phone,
    village: 'Test Village',
    assignedDoctor: doctor._id,
    location: { type: 'Point', coordinates: [80.42, 16.43] },
  })
  incident = await SosIncident.create({
    patient: patient._id,
    triggeredBy: patientUser._id,
    location: { type: 'Point', coordinates: [80.42, 16.43] },
    timeline: [{ status: 'triggered', at: new Date(), actor: patientUser._id }],
  })
  await HealthCentre.create([
    {
      name: 'Drone PHC',
      type: 'PHC',
      address: 'Near road',
      hasDrone: true,
      location: { type: 'Point', coordinates: [80.40, 16.43] },
    },
    {
      name: 'Regular PHC',
      type: 'PHC',
      address: 'Far road',
      hasDrone: false,
      location: { type: 'Point', coordinates: [80.38, 16.43] },
    },
  ])
  await LandingPoint.create({
    village: 'Test Village',
    name: 'Unsafe Landing Site',
    surfaceType: 'field',
    contactPerson: 'Village Contact',
    phone: '9876501190',
    location: { type: 'Point', coordinates: [80.421, 16.43] },
    verifiedAt: new Date(),
    verifiedBy: adminUser._id,
    reverifyAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    isActive: false,
    noFly: true,
  })
  safeLandingPoint = await LandingPoint.create({
    village: 'Test Village',
    name: 'Village School Ground',
    surfaceType: 'open_ground',
    contactPerson: 'Village Contact',
    phone: '9876501191',
    location: { type: 'Point', coordinates: [80.45, 16.43] },
    verifiedAt: new Date(),
    verifiedBy: adminUser._id,
    reverifyAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    isActive: true,
    checklist: {
      clearArea: true,
      minimumAreaConfirmed: true,
      noOverheadWiresOrTrees: true,
      awayFromCrowds: true,
      contactAvailable: true,
    },
  })
  await Patient.create({
    user: await createUser('patient', '9876501105').then(({ _id }) => _id),
    name: 'Other Doctor Patient',
    village: 'Another Village',
    assignedDoctor: otherDoctor._id,
    location: { type: 'Point', coordinates: [80.42, 16.43] },
  })
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('Drone mission module', () => {
  test('scopes CHW landing-point submissions to assigned villages and keeps verification admin-only', async () => {
    const photo = 'data:image/jpeg;base64,/9j/2Q=='
    const scopedPoint = await LandingPoint.create({
      village: 'Test Village',
      mandal: 'Test Mandal',
      district: 'Test District',
      name: 'Assigned Village Site',
      surfaceType: 'open_ground',
      contactPerson: 'Local Contact',
      phone: '9876501192',
      location: { type: 'Point', coordinates: [80.46, 16.43] },
    })
    const outOfScopePoint = await LandingPoint.create({
      village: 'Test Village',
      mandal: 'Other Mandal',
      district: 'Other District',
      name: 'Other District Site',
      surfaceType: 'open_ground',
      contactPerson: 'Other Contact',
      phone: '9876501193',
      location: { type: 'Point', coordinates: [80.47, 16.43] },
    })
    await request(app)
      .get('/api/drone/landing-points')
      .set('Authorization', bearer(chwUser))
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.assignedVillages).toEqual([
          expect.objectContaining({ village: 'Test Village' }),
        ])
        expect(body.data.items.map((point) => point._id)).toEqual([scopedPoint._id.toString()])
        expect(body.data.items[0].photoCount).toBe(0)
        expect(body.data.items[0].photos).toBeUndefined()
      })
    await request(app)
      .get(`/api/drone/landing-points/${outOfScopePoint._id}`)
      .set('Authorization', bearer(chwUser))
      .expect(404)

    await request(app)
      .post('/api/drone/landing-points')
      .set('Authorization', bearer(chwUser))
      .send({
        village: 'Other Village',
        name: 'Out-of-scope Ground',
        surfaceType: 'open_ground',
        contactPerson: 'Local Contact',
        phone: '9876501192',
        location: { type: 'Point', coordinates: [80.46, 16.43] },
      })
      .expect(403)

    await request(app)
      .post('/api/drone/landing-points')
      .set('Authorization', bearer(chwUser))
      .send({
        village: 'Test Village',
        mandal: 'Test Mandal',
        district: 'Test District',
        name: 'Invalid Photo Ground',
        surfaceType: 'open_ground',
        contactPerson: 'Local Contact',
        phone: '9876501192',
        photos: ['data:image/jpeg;base64,not-a-jpeg'],
        location: { type: 'Point', coordinates: [80.46, 16.43] },
      })
      .expect(400)

    const submitted = await request(app)
      .post('/api/drone/landing-points')
      .set('Authorization', bearer(chwUser))
      .send({
        village: 'test village',
        mandal: 'Test Mandal',
        district: 'Test District',
        name: 'CHW Candidate Ground',
        surfaceType: 'open_ground',
        contactPerson: 'Local Contact',
        phone: '9876501192',
        photos: [photo, photo],
        checklist: {
          clearArea: true,
          minimumAreaConfirmed: true,
          noOverheadWiresOrTrees: true,
          awayFromCrowds: true,
          contactAvailable: true,
        },
        location: { type: 'Point', coordinates: [80.46, 16.43] },
      })
      .expect(201)
    const point = submitted.body.data.landingPoint
    expect(point.village).toBe('Test Village')
    expect(point.photos).toHaveLength(2)
    expect(point.isActive).toBe(false)
    expect(point.verifiedAt).toBeUndefined()
    await request(app)
      .get(`/api/drone/landing-points/${point._id}`)
      .set('Authorization', bearer(chwUser))
      .expect(200)
      .expect(({ body }) => expect(body.data.landingPoint.photos).toEqual([photo, photo]))

    await request(app)
      .patch(`/api/drone/landing-points/${point._id}/checklist`)
      .set('Authorization', bearer(chwUser))
      .send({
        checklist: {
          clearArea: true,
          minimumAreaConfirmed: true,
          noOverheadWiresOrTrees: true,
          awayFromCrowds: true,
          contactAvailable: true,
        },
      })
      .expect(200)

    await request(app)
      .patch(`/api/drone/landing-points/${point._id}`)
      .set('Authorization', bearer(chwUser))
      .send({ verified: true })
      .expect(403)

    await request(app)
      .patch(`/api/drone/landing-points/${point._id}`)
      .set('Authorization', bearer(adminUser))
      .send({ verified: true })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.landingPoint.isActive).toBe(false)
        expect(body.data.landingPoint.verifiedBy).toBe(adminUser._id.toString())
        expect(new Date(body.data.landingPoint.reverifyAt).getTime()).toBeGreaterThan(Date.now() + 180 * 24 * 60 * 60 * 1000)
      })
    await request(app)
      .patch(`/api/drone/landing-points/${point._id}`)
      .set('Authorization', bearer(adminUser))
      .send({ isActive: true })
      .expect(200)
      .expect(({ body }) => expect(body.data.landingPoint.isActive).toBe(true))
  })

  test('requests for an SOS choose nearest safe origin/landing, await approval, then dispatch and notify the contact', async () => {
    const requested = await request(app)
      .post('/api/drone/missions')
      .set('Authorization', bearer(patientUser))
      .send({ sosIncident: incident._id.toString(), payload: ['medicine', 'glucoseKit'] })
      .expect(201)

    const mission = requested.body.data.mission
    expect(mission.status).toBe('requested')
    expect(mission.landingPoint._id).toBe(safeLandingPoint._id.toString())
    expect(mission.originHealthCentre.name).toBe('Drone PHC')
    expect(mission.distanceKm).toBeGreaterThan(0)
    expect(new Date(mission.eta).getTime()).toBeGreaterThan(Date.now())
    expect(requested.body.data.simulation).toBe(true)
    expect(await DroneMission.countDocuments()).toBe(1)
    expect((await SosIncident.findById(incident._id)).status).toBe('droneRequested')

    await request(app)
      .post(`/api/drone/missions/${mission._id}/approve`)
      .set('Authorization', bearer(patientUser))
      .expect(403)

    const approved = await request(app)
      .post(`/api/drone/missions/${mission._id}/approve`)
      .set('Authorization', bearer(doctorUser))
      .expect(200)
    expect(approved.body.data.mission.status).toBe('dispatched')
    expect(approved.body.data.mission.approvedBy._id).toBe(doctorUser._id.toString())
    expect(approved.body.data.provider.simulated).toBe(true)
    expect(approved.body.data.contactSms).toMatchObject({ status: 'simulated', provider: 'mock' })
    expect(await SmsLog.findOne({ droneMission: mission._id }).lean()).toMatchObject({
      toPhoneHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      purpose: 'drone_arrival',
      status: 'simulated',
      bodyRedacted: expect.stringContaining('Drone arrival at Village School Ground in'),
    })
    expect((await SmsLog.findOne({ droneMission: mission._id }).lean()).recipient).toBeUndefined()
    expect(await Notification.countDocuments({ type: 'drone_update' })).toBe(1)

    const repeatedRequest = await request(app)
      .post('/api/drone/missions')
      .set('Authorization', bearer(patientUser))
      .send({ sosIncident: incident._id.toString(), payload: ['medicine'] })
      .expect(200)
    expect(repeatedRequest.body.data.duplicate).toBe(true)
    expect(repeatedRequest.body.data.mission._id).toBe(mission._id)
    expect(await DroneMission.countDocuments()).toBe(1)
  })

  test('enforces weather/no-fly safety and mission status transitions and abort', async () => {
    configureDroneAdapters({
      weather: {
        async checkFlightConditions() {
          return { safe: false, reason: 'High winds at the landing area.' }
        },
      },
    })
    await request(app)
      .post('/api/drone/missions')
      .set('Authorization', bearer(doctorUser))
      .send({ patientId: patient._id.toString(), payload: ['firstAid'] })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('DRONE_WEATHER_UNSAFE'))
    expect(await DroneMission.countDocuments()).toBe(0)

    configureDroneAdapters({ weather: new MockWeatherProvider() })
    const requested = await request(app)
      .post('/api/drone/missions')
      .set('Authorization', bearer(doctorUser))
      .send({ patientId: patient._id.toString(), payload: ['firstAid'] })
      .expect(201)
    const missionId = requested.body.data.mission._id
    await request(app)
      .post(`/api/drone/missions/${missionId}/approve`)
      .set('Authorization', bearer(doctorUser))
      .expect(200)

    await request(app)
      .patch(`/api/drone/missions/${missionId}/status`)
      .set('Authorization', bearer(doctorUser))
      .send({ status: 'enRoute' })
      .expect(200)
      .expect(({ body }) => expect(body.data.mission.status).toBe('enRoute'))

    await request(app)
      .post(`/api/drone/missions/${missionId}/abort`)
      .set('Authorization', bearer(adminUser))
      .send({ reason: 'Weather changed.' })
      .expect(200)
      .expect(({ body }) => expect(body.data.mission.status).toBe('aborted'))
    expect(await AuditLog.countDocuments({ resourceType: 'DroneMission' })).toBeGreaterThanOrEqual(4)
  })

  test('restricts approval and mission reads to the assigned doctor and enforces landing point verification', async () => {
    const createdPoint = await request(app)
      .post('/api/drone/landing-points')
      .set('Authorization', bearer(adminUser))
      .send({
        village: 'New Village',
        name: 'New Ground',
        surfaceType: 'field',
        contactPerson: 'Local Contact',
        phone: '9876501192',
        photos: [],
        location: { type: 'Point', coordinates: [80.46, 16.43] },
      })
      .expect(201)
    const landingId = createdPoint.body.data.landingPoint._id
    expect(createdPoint.body.data.landingPoint.isActive).toBe(false)
    await request(app)
      .patch(`/api/drone/landing-points/${landingId}`)
      .set('Authorization', bearer(adminUser))
      .send({ isActive: true })
      .expect(409)
    await request(app)
      .patch(`/api/drone/landing-points/${landingId}`)
      .set('Authorization', bearer(adminUser))
      .send({
        checklist: {
          clearArea: true,
          minimumAreaConfirmed: true,
          noOverheadWiresOrTrees: true,
          awayFromCrowds: true,
          contactAvailable: true,
        },
      })
      .expect(200)
    const verified = await request(app)
      .patch(`/api/drone/landing-points/${landingId}`)
      .set('Authorization', bearer(adminUser))
      .send({ verified: true, isActive: true })
      .expect(200)
    expect(verified.body.data.landingPoint.verifiedBy).toBe(adminUser._id.toString())
    expect(verified.body.data.landingPoint.reverifyAt).toBeTruthy()

    const createdMission = await request(app)
      .post('/api/drone/missions')
      .set('Authorization', bearer(doctorUser))
      .send({ patientId: patient._id.toString(), payload: ['AED'] })
      .expect(201)
    const missionId = createdMission.body.data.mission._id
    await request(app)
      .post(`/api/drone/missions/${missionId}/approve`)
      .set('Authorization', bearer(otherDoctorUser))
      .expect(403)
    await request(app)
      .get(`/api/drone/missions/${missionId}`)
      .set('Authorization', bearer(otherDoctorUser))
      .expect(403)

    await request(app)
      .patch(`/api/drone/landing-points/${safeLandingPoint._id}`)
      .set('Authorization', bearer(adminUser))
      .send({ noFly: true, noFlyReason: 'Temporary obstruction.' })
      .expect(200)
    await request(app)
      .post(`/api/drone/missions/${missionId}/approve`)
      .set('Authorization', bearer(doctorUser))
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('LANDING_POINT_UNSAFE'))
  })
})
