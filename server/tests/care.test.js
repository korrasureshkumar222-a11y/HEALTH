import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import Appointment from '../src/models/Appointment.js'
import Chw from '../src/models/Chw.js'
import Doctor from '../src/models/Doctor.js'
import HealthRecord from '../src/models/HealthRecord.js'
import Medication from '../src/models/Medication.js'
import Note from '../src/models/Note.js'
import Patient from '../src/models/Patient.js'
import User from '../src/models/User.js'
import { createAccessToken } from '../src/utils/tokenUtils.js'

let mongo
let doctorUser
let otherDoctorUser
let patientUser
let doctor
let patient

async function createUser(role, phone) {
  return User.create({ role, phone, name: `${role} ${phone}`, passwordHash: 'care-test-password' })
}

function bearer(user) {
  return `Bearer ${createAccessToken(user)}`
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await Promise.all([
    User.init(),
    Chw.init(),
    Doctor.init(),
    Patient.init(),
    HealthRecord.init(),
    Note.init(),
    Medication.init(),
    Appointment.init(),
  ])
})

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  )
  doctorUser = await createUser('doctor', '9876543210')
  otherDoctorUser = await createUser('doctor', '9876543211')
  patientUser = await createUser('patient', '9876543212')
  const chwUser = await createUser('chw', '9876543213')
  doctor = await Doctor.create({
    user: doctorUser._id,
    specialization: 'General Medicine',
    registrationNo: 'CARE-DOCTOR-1',
    isVerified: true,
    availability: Array.from({ length: 7 }, (_unused, dayOfWeek) => ({
      dayOfWeek,
      startTime: '00:00',
      endTime: '23:30',
      timezone: 'Asia/Kolkata',
    })),
  })
  const chw = await Chw.create({
    user: chwUser._id,
    employeeId: 'CARE-CHW-1',
    assignedVillages: [{ village: 'Mangalagiri' }],
  })
  patient = await Patient.create({
    user: patientUser._id,
    village: 'Mangalagiri',
    assignedDoctor: doctor._id,
    assignedChw: chw._id,
  })
  await Doctor.create({
    user: otherDoctorUser._id,
    specialization: 'Cardiology',
    registrationNo: 'CARE-DOCTOR-2',
    isVerified: true,
    availability: Array.from({ length: 7 }, (_unused, dayOfWeek) => ({
      dayOfWeek,
      startTime: '00:00',
      endTime: '23:30',
      timezone: 'Asia/Kolkata',
    })),
  })
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('doctor patient care workspace APIs', () => {
  test('creates a care-team note and retains a revision when edited', async () => {
    const created = await request(app)
      .post(`/api/patients/${patient._id}/notes`)
      .set('Authorization', bearer(doctorUser))
      .send({ kind: 'clinical', body: 'Discussed blood pressure control.' })
      .expect(201)
    const noteId = created.body.data.note._id

    await request(app)
      .patch(`/api/patients/${patient._id}/notes/${noteId}`)
      .set('Authorization', bearer(doctorUser))
      .send({ body: 'Discussed medication adherence.', editReason: 'Corrected visit summary' })
      .expect(200)

    const note = await Note.findById(noteId).lean()
    expect(note.body).toBe('Discussed medication adherence.')
    expect(note.revisions).toHaveLength(1)
    expect(note.revisions[0].body).toBe('Discussed blood pressure control.')
  })

  test('prescribes and updates medication with prescription history', async () => {
    const response = await request(app)
      .post(`/api/patients/${patient._id}/medications`)
      .set('Authorization', bearer(doctorUser))
      .send({
        name: 'Example medicine',
        dose: '5 mg',
        frequency: 'Once daily',
        timings: ['08:00'],
        startDate: new Date().toISOString(),
      })
      .expect(201)
    const medicationId = response.body.data.medication._id

    const updated = await request(app)
      .patch(`/api/patients/${patient._id}/medications/${medicationId}`)
      .set('Authorization', bearer(doctorUser))
      .send({ dose: '10 mg', reason: 'Dose adjusted after review' })
      .expect(200)

    expect(updated.body.data.medication.dose).toBe('10 mg')
    expect(updated.body.data.medication.prescriptionHistory).toHaveLength(1)
    expect(await Medication.countDocuments({ patient: patient._id, active: true })).toBe(1)

    const dashboard = await request(app)
      .get('/api/dashboard/patient')
      .set('Authorization', bearer(patientUser))
      .expect(200)
    expect(dashboard.body.data.todayMedications.items).toMatchObject([
      { name: 'Example medicine', dose: '10 mg', time: '08:00', taken: false },
    ])
  })

  test('schedules an appointment and lists it for the patient timeline', async () => {
    const scheduledAt = new Date(Math.ceil((Date.now() + 60_000) / (30 * 60_000)) * (30 * 60_000)).toISOString()
    const response = await request(app)
      .post(`/api/patients/${patient._id}/appointments`)
      .set('Authorization', bearer(doctorUser))
      .send({
        scheduledAt,
        mode: 'phone',
        reason: 'Follow-up',
      })
      .expect(201)

    expect(response.body.data.appointment.status).toBe('confirmed')
    const doctorDashboard = await request(app)
      .get('/api/dashboard/doctor')
      .set('Authorization', bearer(doctorUser))
      .expect(200)
    expect(doctorDashboard.body.data.summary.appointmentsToday).toBe(1)
    const patientDashboard = await request(app)
      .get('/api/dashboard/patient')
      .set('Authorization', bearer(patientUser))
      .expect(200)
    expect(patientDashboard.body.data.nextAppointment.appointment._id)
      .toBe(response.body.data.appointment._id)
    await request(app)
      .post(`/api/patients/${patient._id}/appointments`)
      .set('Authorization', bearer(doctorUser))
      .send({ scheduledAt, mode: 'phone' })
      .expect(409)
    const timeline = await request(app)
      .get(`/api/patients/${patient._id}/timeline`)
      .set('Authorization', bearer(doctorUser))
      .expect(200)
    expect(timeline.body.data.items.some((entry) => entry.type === 'appointment')).toBe(true)
  })

  test('patients request an available slot, doctors confirm it, and cancellations release the slot', async () => {
    const scheduledAt = new Date(Math.ceil((Date.now() + 60_000) / (30 * 60_000)) * (30 * 60_000)).toISOString()
    const from = new Date(new Date(scheduledAt).getTime() - 60 * 60_000).toISOString()
    const to = new Date(new Date(scheduledAt).getTime() + 60 * 60_000).toISOString()
    const availability = await request(app)
      .get('/api/appointments/availability')
      .query({ doctorId: doctor._id.toString(), from, to })
      .set('Authorization', bearer(patientUser))
      .expect(200)
    expect(availability.body.data.slots.map(({ scheduledAt: slot }) => new Date(slot).toISOString()))
      .toContain(scheduledAt)

    const created = await request(app)
      .post('/api/appointments')
      .set('Authorization', bearer(patientUser))
      .send({ doctorId: doctor._id.toString(), scheduledAt, mode: 'video', reason: 'Check-in' })
      .expect(201)
    const appointmentId = created.body.data.appointment._id
    expect(created.body.data.appointment.status).toBe('requested')

    await request(app)
      .post('/api/appointments')
      .set('Authorization', bearer(patientUser))
      .send({ doctorId: doctor._id.toString(), scheduledAt, mode: 'phone' })
      .expect(409)

    await request(app)
      .patch(`/api/appointments/${appointmentId}/confirm`)
      .set('Authorization', bearer(doctorUser))
      .send({})
      .expect(200)
      .expect(({ body }) => expect(body.data.appointment.status).toBe('confirmed'))

    const newScheduledAt = new Date(new Date(scheduledAt).getTime() + 30 * 60_000).toISOString()
    await request(app)
      .patch(`/api/appointments/${appointmentId}/reschedule`)
      .set('Authorization', bearer(patientUser))
      .send({ scheduledAt: newScheduledAt, durationMinutes: 30 })
      .expect(200)
      .expect(({ body }) => expect(body.data.appointment.status).toBe('requested'))

    await request(app)
      .patch(`/api/appointments/${appointmentId}/cancel`)
      .set('Authorization', bearer(patientUser))
      .send({ reason: 'Cannot attend' })
      .expect(200)

    const replacement = await request(app)
      .post('/api/appointments')
      .set('Authorization', bearer(patientUser))
      .send({ doctorId: doctor._id.toString(), scheduledAt, mode: 'phone' })
      .expect(201)
    expect(replacement.body.data.appointment._id).not.toBe(appointmentId)
  })

  test('the unique slot reservation index rejects simultaneous overlapping requests', async () => {
    const scheduledAt = new Date(Math.ceil((Date.now() + 60_000) / (30 * 60_000)) * (30 * 60_000)).toISOString()
    const payload = { doctorId: doctor._id.toString(), scheduledAt, mode: 'phone' }
    const responses = await Promise.all([
      request(app).post('/api/appointments').set('Authorization', bearer(patientUser)).send(payload),
      request(app).post('/api/appointments').set('Authorization', bearer(patientUser)).send(payload),
    ])
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409])
    expect(await Appointment.countDocuments({ doctor: doctor._id, isActiveReservation: true })).toBe(1)
  })

  test('a 60-minute booking reserves both half-hour slots', async () => {
    const scheduledAt = new Date(Math.ceil((Date.now() + 60_000) / (30 * 60_000)) * (30 * 60_000))
    await request(app)
      .post('/api/appointments')
      .set('Authorization', bearer(patientUser))
      .send({
        doctorId: doctor._id.toString(),
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes: 60,
        mode: 'video',
      })
      .expect(201)

    await request(app)
      .post('/api/appointments')
      .set('Authorization', bearer(patientUser))
      .send({
        doctorId: doctor._id.toString(),
        scheduledAt: new Date(scheduledAt.getTime() + 30 * 60_000).toISOString(),
        mode: 'phone',
      })
      .expect(409)
  })

  test('CHWs can book for assigned-village patients with their assigned doctor', async () => {
    const chwUser = await User.findOne({ role: 'chw' })
    const scheduledAt = new Date(Math.ceil((Date.now() + 60_000) / (30 * 60_000)) * (30 * 60_000)).toISOString()
    const response = await request(app)
      .post('/api/appointments')
      .set('Authorization', bearer(chwUser))
      .send({ patientId: patient._id.toString(), doctorId: doctor._id.toString(), scheduledAt, mode: 'phone' })
      .expect(201)
    expect(response.body.data.appointment.status).toBe('requested')
    const otherDoctor = await Doctor.findOne({ registrationNo: 'CARE-DOCTOR-2' })
    await request(app)
      .post('/api/appointments')
      .set('Authorization', bearer(chwUser))
      .send({ patientId: patient._id.toString(), doctorId: otherDoctor._id.toString(), scheduledAt, mode: 'phone' })
      .expect(403)

    await request(app)
      .get('/api/appointments')
      .set('Authorization', bearer(chwUser))
      .expect(200)
      .expect(({ body }) => expect(body.data.items).toHaveLength(1))
  })

  test('does not allow an unassigned doctor to access notes, medication, or appointments', async () => {
    await request(app)
      .get(`/api/patients/${patient._id}/notes`)
      .set('Authorization', bearer(otherDoctorUser))
      .expect(403)
    await request(app)
      .post(`/api/patients/${patient._id}/medications`)
      .set('Authorization', bearer(otherDoctorUser))
      .send({
        name: 'Wrong-scope',
        dose: '1',
        frequency: 'daily',
        timings: ['08:00'],
        startDate: new Date().toISOString(),
      })
      .expect(403)
    expect(await Medication.countDocuments()).toBe(0)
  })
})
