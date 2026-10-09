import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import Alert from '../src/models/Alert.js'
import AuditLog from '../src/models/AuditLog.js'
import Appointment from '../src/models/Appointment.js'
import Chw from '../src/models/Chw.js'
import Doctor from '../src/models/Doctor.js'
import HealthRecord from '../src/models/HealthRecord.js'
import Medication from '../src/models/Medication.js'
import Notification from '../src/models/Notification.js'
import Patient from '../src/models/Patient.js'
import SmsLog from '../src/models/SmsLog.js'
import User from '../src/models/User.js'
import {
  createMissedReadingAlerts,
  escalateDueAlerts,
  sendAppointmentReminders,
  sendMedicationReminders,
} from '../src/services/alertService.js'
import { createAccessToken } from '../src/utils/tokenUtils.js'

let mongo
let adminUser
let doctorUser
let chwUser
let patientUser
let otherUser
let doctor
let patient
let otherPatient

async function createUser(role, phone) {
  return User.create({
    name: `${role} ${phone}`,
    phone,
    passwordHash: 'alert-test-password',
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
    Appointment.init(),
    Chw.init(),
    Doctor.init(),
    HealthRecord.init(),
    Medication.init(),
    Notification.init(),
    Patient.init(),
    SmsLog.init(),
    User.init(),
  ])
})

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  )
  adminUser = await createUser('admin', '9876543200')
  doctorUser = await createUser('doctor', '9876543201')
  chwUser = await createUser('chw', '9876543202')
  patientUser = await createUser('patient', '9876543203')
  otherUser = await createUser('patient', '9876543204')
  doctor = await Doctor.create({
    user: doctorUser._id,
    specialization: 'General Medicine',
    registrationNo: 'ALERT-DOCTOR-1',
  })
  await Chw.create({
    user: chwUser._id,
    employeeId: 'ALERT-CHW-1',
    assignedVillages: [{ village: 'Mangalagiri', mandal: 'Mangalagiri', district: 'Guntur' }],
  })
  patient = await Patient.create({
    user: patientUser._id,
    phone: patientUser.phone,
    village: 'Mangalagiri',
    mandal: 'Mangalagiri',
    district: 'Guntur',
    assignedDoctor: doctor._id,
  })
  otherPatient = await Patient.create({
    user: otherUser._id,
    phone: otherUser.phone,
    village: 'Tenali',
    district: 'Guntur',
  })
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('alerts API and scheduled services', () => {
  test('confirmed appointment reminders fan out in-app and SMS once per reminder window', async () => {
    const now = new Date()
    const scheduledAt = new Date(now.getTime() + 60 * 60_000)
    const appointment = await Appointment.create({
      patient: patient._id,
      doctor: doctor._id,
      scheduledAt,
      durationMinutes: 30,
      mode: 'phone',
      status: 'confirmed',
      createdBy: doctorUser._id,
      reservedSlotKeys: [scheduledAt.toISOString()],
      isActiveReservation: true,
      statusHistory: [{ status: 'confirmed', changedBy: doctorUser._id, changedAt: now }],
    })

    await sendAppointmentReminders(now)
    await sendAppointmentReminders(now)

    expect(await Notification.countDocuments({
      user: patientUser._id,
      type: 'appointment_reminder',
      'relatedResource.id': appointment._id,
    })).toBe(1)
    expect(await SmsLog.countDocuments({
      appointment: appointment._id,
      purpose: 'appointment_reminder',
    })).toBe(1)
  })

  test('reading alerts are localized, deduplicated, and notified to the assigned doctor', async () => {
    const reading = {
      type: 'bp',
      values: { systolic: 180, diastolic: 90, unit: 'mmHg' },
      recordedAt: new Date().toISOString(),
      clientId: 'a81c8454-6000-4f20-b788-ce2425733941',
    }
    await request(app)
      .post('/api/readings')
      .set('Authorization', bearer(patientUser))
      .send(reading)
      .expect(201)

    const alert = await Alert.findOne({ patient: patient._id }).lean()
    expect(alert).toMatchObject({
      type: 'critical_reading',
      severity: 'critical',
      status: 'open',
      message: { en: expect.any(String), te: expect.any(String) },
      escalation: { level: 0 },
    })
    expect(await Notification.countDocuments({
      user: doctorUser._id,
      'relatedResource.kind': 'Alert',
      'relatedResource.id': alert._id,
    })).toBe(1)

    await request(app)
      .post('/api/readings/bulk')
      .set('Authorization', bearer(patientUser))
      .send({
        items: [{
          ...reading,
          clientId: 'b81c8454-6000-4f20-b788-ce2425733941',
          values: { systolic: 185, diastolic: 92, unit: 'mmHg' },
        }],
      })
      .expect(200)
    expect(await Alert.countDocuments({ patient: patient._id, type: 'critical_reading' })).toBe(1)
    expect(await Notification.countDocuments({
      user: doctorUser._id,
      type: 'critical_alert',
    })).toBe(1)

    await request(app)
      .patch(`/api/alerts/${alert._id}/resolve`)
      .set('Authorization', bearer(doctorUser))
      .send({ resolutionNote: 'Reviewed and closed.' })
      .expect(200)
    await request(app)
      .post('/api/readings')
      .set('Authorization', bearer(patientUser))
      .send({
        ...reading,
        clientId: 'c81c8454-6000-4f20-b788-ce2425733941',
      })
      .expect(201)
    expect(await Alert.countDocuments({ patient: patient._id, type: 'critical_reading' })).toBe(2)
  })

  test('lists alerts within user scope and permits staff acknowledge/resolve transitions', async () => {
    const alert = await Alert.create({
      patient: patient._id,
      type: 'missed_reading',
      severity: 'warning',
      message: { en: 'No reading', te: 'రీడింగ్ లేదు' },
      dedupeKey: 'missed-test-1',
    })
    await Alert.create({
      patient: otherPatient._id,
      type: 'missed_reading',
      severity: 'warning',
      message: { en: 'Other reading', te: 'ఇతర రీడింగ్' },
      dedupeKey: 'missed-test-2',
    })

    const patientList = await request(app)
      .get('/api/alerts?status=open')
      .set('Authorization', bearer(patientUser))
      .expect(200)
    expect(patientList.body.data.total).toBe(1)

    await request(app)
      .get('/api/alerts')
      .set('Authorization', bearer(otherUser))
      .expect(200)
      .expect(({ body }) => expect(body.data.total).toBe(1))

    const acknowledged = await request(app)
      .patch(`/api/alerts/${alert._id}/acknowledge`)
      .set('Authorization', bearer(doctorUser))
      .send({ note: 'Contacted the patient.' })
      .expect(200)
    expect(acknowledged.body.data.alert).toMatchObject({
      status: 'acknowledged',
      acknowledgmentNote: 'Contacted the patient.',
      acknowledgedBy: doctorUser._id.toString(),
    })

    const resolved = await request(app)
      .patch(`/api/alerts/${alert._id}/resolve`)
      .set('Authorization', bearer(doctorUser))
      .send({ resolutionNote: 'Follow-up completed.' })
      .expect(200)
    expect(resolved.body.data.alert.status).toBe('resolved')
    expect(await AuditLog.countDocuments({ resourceType: 'Alert' })).toBe(2)

    await request(app)
      .patch(`/api/alerts/${alert._id}/resolve`)
      .set('Authorization', bearer(doctorUser))
      .send({ resolutionNote: 'Repeated resolution' })
      .expect(409)
    await request(app)
      .patch(`/api/alerts/${alert._id}/resolve`)
      .set('Authorization', bearer(chwUser))
      .send({ resolutionNote: 'CHW cannot resolve' })
      .expect(403)
  })

  test('escalates an unacknowledged alert from the assigned doctor to the CHW', async () => {
    const alert = await Alert.create({
      patient: patient._id,
      type: 'critical_reading',
      severity: 'critical',
      message: { en: 'Urgent reading', te: 'తక్షణ రీడింగ్' },
      dedupeKey: 'escalate-test',
      escalation: {
        level: 0,
        nextEscalationAt: new Date(Date.now() - 60_000),
      },
    })
    const result = await escalateDueAlerts()
    const escalated = await Alert.findById(alert._id).lean()
    expect(result.escalated).toBe(1)
    expect(escalated.escalation.level).toBe(1)
    expect(await Notification.exists({
      user: chwUser._id,
      'relatedResource.id': alert._id,
    })).toBeTruthy()
  })

  test('detects patients without readings for 24 hours and sends due medication reminders once', async () => {
    const now = new Date('2026-10-08T02:30:00.000Z')
    await HealthRecord.create({
      patient: otherPatient._id,
      type: 'heartRate',
      values: { value: 70, unit: 'bpm' },
      recordedAt: new Date(now.getTime() - 60 * 60_000),
      recordedBy: otherUser._id,
      source: 'self',
      status: 'normal',
    })
    const missed = await createMissedReadingAlerts(now)
    expect(missed.checked).toBe(1)
    expect(await Alert.exists({ patient: patient._id, type: 'missed_reading' })).toBeTruthy()
    expect(await Alert.exists({ patient: otherPatient._id, type: 'missed_reading' })).toBeFalsy()

    await Medication.create({
      patient: patient._id,
      name: 'Example medicine',
      dose: '1 tablet',
      frequency: 'Once daily',
      timings: ['08:00'],
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      prescribedBy: doctor._id,
      active: true,
    })
    const reminder = await sendMedicationReminders(now)
    expect(reminder.notified).toBe(1)
    expect(await Notification.countDocuments({
      user: patientUser._id,
      type: 'medication_reminder',
    })).toBe(1)
    expect((await sendMedicationReminders(now)).notified).toBe(0)
  })
})
