import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import Alert from '../src/models/Alert.js'
import Doctor from '../src/models/Doctor.js'
import HealthCentre from '../src/models/HealthCentre.js'
import HealthRecord from '../src/models/HealthRecord.js'
import Patient from '../src/models/Patient.js'
import User from '../src/models/User.js'
import { createAccessToken } from '../src/utils/tokenUtils.js'

let mongo
let patientUser
let doctorUser
let doctor
let patient

function bearer(user) {
  return createAccessToken(user)
}

async function createUser(role, phone, name) {
  return User.create({ role, phone, name, passwordHash: 'dashboard-test-password' })
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await Promise.all([
    User.init(),
    Patient.init(),
    Doctor.init(),
    HealthRecord.init(),
    Alert.init(),
    HealthCentre.init(),
  ])
})

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  )
  patientUser = await createUser('patient', '9876543210', 'Ravi Kumar')
  doctorUser = await createUser('doctor', '9876543211', 'Dr Rao')
  doctor = await Doctor.create({
    user: doctorUser._id,
    specialization: 'General Medicine',
    registrationNo: 'DASHBOARD-DOCTOR-1',
  })
  patient = await Patient.create({
    user: patientUser._id,
    name: patientUser.name,
    phone: patientUser.phone,
    village: 'Mangalagiri',
    location: { type: 'Point', coordinates: [80.64, 16.24] },
  })
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('patient dashboard API', () => {
  test('aggregates latest readings, trends, open alerts, and nearest health centre', async () => {
    await HealthRecord.create([
      {
        patient: patient._id,
        type: 'bp',
        values: { systolic: 120, diastolic: 80, unit: 'mmHg' },
        recordedAt: new Date('2026-10-05T10:00:00.000Z'),
        recordedBy: patientUser._id,
        source: 'self',
        status: 'normal',
      },
      {
        patient: patient._id,
        type: 'bp',
        values: { systolic: 140, diastolic: 90, unit: 'mmHg' },
        recordedAt: new Date('2026-10-06T10:00:00.000Z'),
        recordedBy: patientUser._id,
        source: 'self',
        status: 'warning',
      },
      {
        patient: patient._id,
        type: 'spo2',
        values: { value: 97, unit: '%' },
        recordedAt: new Date('2026-10-06T11:00:00.000Z'),
        recordedBy: patientUser._id,
        source: 'self',
        status: 'normal',
      },
    ])
    await Alert.create([
      {
        patient: patient._id,
        type: 'warning_reading',
        severity: 'warning',
        message: { en: 'Review reading', te: 'రీడింగ్‌ను సమీక్షించండి' },
        dedupeKey: 'dashboard-open-alert',
      },
      {
        patient: patient._id,
        type: 'warning_reading',
        severity: 'warning',
        message: { en: 'Resolved reading', te: 'రీడింగ్ పరిష్కరించబడింది' },
        status: 'resolved',
        dedupeKey: 'dashboard-resolved-alert',
      },
    ])
    const centre = await HealthCentre.create({
      name: 'Mangalagiri PHC',
      type: 'PHC',
      address: 'Main road, Mangalagiri',
      phone: '+918612345678',
      location: { type: 'Point', coordinates: [80.65, 16.25] },
    })
    await HealthCentre.create({
      name: 'Far PHC',
      type: 'PHC',
      address: 'Far away',
      location: { type: 'Point', coordinates: [81, 17] },
    })

    const response = await request(app)
      .get('/api/dashboard/patient')
      .set('Authorization', `Bearer ${bearer(patientUser)}`)
      .expect(200)
    const bp = response.body.data.latestVitals.find((vital) => vital.type === 'bp')

    expect(response.body.data).toMatchObject({
      patientId: patient._id.toString(),
      patientName: 'Ravi Kumar',
      openAlertsCount: 1,
      todayMedications: { items: [], available: true },
      nextAppointment: { appointment: null, available: true },
      nearestHealthCentre: {
        id: centre._id.toString(),
        name: 'Mangalagiri PHC',
        phone: '+918612345678',
      },
    })
    expect(response.body.data.nearestHealthCentre.distanceKm).toBeGreaterThan(0)
    expect(bp).toMatchObject({
      latest: {
        values: { systolic: 140, diastolic: 90 },
        status: 'warning',
      },
      previous: { values: { systolic: 120 } },
      trend: 'up',
    })
    expect(response.body.data.latestVitals.find((vital) => vital.type === 'spo2'))
      .toMatchObject({ trend: 'new' })
  })

  test('returns empty vital, alert, and location states when no dashboard data exists', async () => {
    const response = await request(app)
      .get('/api/dashboard/patient')
      .set('Authorization', `Bearer ${bearer(patientUser)}`)
      .expect(200)

    expect(response.body.data.latestVitals).toHaveLength(6)
    expect(response.body.data.latestVitals.every((vital) => vital.latest === null)).toBe(true)
    expect(response.body.data.openAlertsCount).toBe(0)
    expect(response.body.data.nearestHealthCentre).toBeNull()
  })

  test('restricts dashboard access to patients', async () => {
    await request(app)
      .get('/api/dashboard/patient')
      .set('Authorization', `Bearer ${bearer(doctorUser)}`)
      .expect(403)
  })

  test('returns assigned patients risk-sorted with summary and alert feed', async () => {
    const today = new Date()
    const otherPatient = await Patient.create({
      name: 'Sita Devi',
      phone: '9876543212',
      village: 'Tenali',
      conditions: ['diabetes'],
      assignedDoctor: doctor._id,
    })
    const unassignedPatient = await Patient.create({
      name: 'Unassigned',
      phone: '9876543213',
      village: 'Guntur',
    })
    patient.assignedDoctor = doctor._id
    await patient.save()
    await HealthRecord.create([
      {
        patient: patient._id,
        type: 'bp',
        values: { systolic: 190, diastolic: 100, unit: 'mmHg' },
        recordedAt: today,
        recordedBy: patientUser._id,
        source: 'self',
        status: 'critical',
      },
      {
        patient: otherPatient._id,
        type: 'bp',
        values: { systolic: 120, diastolic: 80, unit: 'mmHg' },
        recordedAt: new Date('2026-09-01T10:00:00.000Z'),
        recordedBy: patientUser._id,
        source: 'self',
        status: 'normal',
      },
    ])
    await Alert.create({
      patient: patient._id,
      type: 'critical_reading',
      severity: 'critical',
      message: { en: 'Critical reading', te: 'తీవ్రమైన రీడింగ్' },
      dedupeKey: 'doctor-dashboard-critical',
    })

    const response = await request(app)
      .get('/api/dashboard/doctor')
      .set('Authorization', `Bearer ${bearer(doctorUser)}`)
      .expect(200)

    expect(response.body.data.summary).toMatchObject({
      totalPatients: 2,
      criticalNow: 1,
      missedReadingsToday: 1,
      appointmentsToday: 0,
      appointmentsAvailable: true,
    })
    expect(response.body.data.patients.map(({ name }) => name)).toEqual(['Ravi Kumar', 'Sita Devi'])
    expect(response.body.data.patients.map(({ riskScore }) => riskScore)).toEqual([300, 100])
    expect(response.body.data.alerts).toHaveLength(1)
    expect(response.body.data.alerts[0].patient._id).toBe(patient._id.toString())
    expect(response.body.data.patients.some(({ name }) => name === 'Unassigned')).toBe(false)
  })

  test('applies doctor dashboard filters to risk-sorted patients', async () => {
    patient.assignedDoctor = doctor._id
    await patient.save()
    await request(app)
      .get('/api/dashboard/doctor?condition=hypertension')
      .set('Authorization', `Bearer ${bearer(doctorUser)}`)
      .expect(200)
      .then((response) => {
        expect(response.body.data.patients).toHaveLength(0)
        expect(response.body.data.total).toBe(0)
        expect(response.body.data.summary.totalPatients).toBe(1)
      })
    await request(app)
      .get('/api/dashboard/doctor?status=missed&village=Mangalagiri')
      .set('Authorization', `Bearer ${bearer(doctorUser)}`)
      .expect(200)
      .then((response) => {
        expect(response.body.data.patients).toHaveLength(1)
        expect(response.body.data.patients[0].riskStatus).toBe('missed')
      })
  })

  test('does not allow a patient role to access the doctor dashboard', async () => {
    await request(app)
      .get('/api/dashboard/doctor')
      .set('Authorization', `Bearer ${bearer(patientUser)}`)
      .expect(403)
  })
})
