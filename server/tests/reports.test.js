import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import AuditLog from '../src/models/AuditLog.js'
import HealthRecord from '../src/models/HealthRecord.js'
import Patient from '../src/models/Patient.js'
import User from '../src/models/User.js'
import { createAccessToken } from '../src/utils/tokenUtils.js'

let mongo
let patientUser
let adminUser
let patient

function bearer(user) {
  return `Bearer ${createAccessToken(user)}`
}

function pdfParser(response, callback) {
  const chunks = []
  response.on('data', (chunk) => chunks.push(chunk))
  response.on('end', () => callback(null, Buffer.concat(chunks)))
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await Promise.all([
    AuditLog.init(),
    HealthRecord.init(),
    Patient.init(),
    User.init(),
  ])
}, 300_000)

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  )
  patientUser = await User.create({
    role: 'patient',
    phone: '9876543210',
    name: 'Lakshmi Patient',
    passwordHash: 'reports-test-password',
  })
  adminUser = await User.create({
    role: 'admin',
    phone: '9876543211',
    name: 'Reports Admin',
    passwordHash: 'reports-test-password',
  })
  patient = await Patient.create({
    user: patientUser._id,
    name: 'Lakshmi Patient',
    phone: patientUser.phone,
    village: 'Mangalagiri',
    age: 55,
    conditions: ['hypertension'],
  })
  await HealthRecord.create({
    patient: patient._id,
    type: 'bp',
    values: { systolic: 130, diastolic: 85, unit: 'mmHg' },
    recordedAt: new Date(),
    recordedBy: patientUser._id,
    source: 'self',
    status: 'warning',
    notes: '=2+2',
  })
})

afterAll(async () => {
  await mongoose.disconnect()
  if (mongo) await mongo.stop()
})

describe('report downloads', () => {
  test('returns a private PDF with an embedded font to the patient', async () => {
    const response = await request(app)
      .get(`/api/reports/patients/${patient._id}/summary.pdf?language=te`)
      .set('Authorization', bearer(patientUser))
      .buffer(true)
      .parse(pdfParser)

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('application/pdf')
    expect(response.headers['cache-control']).toContain('no-store')
    expect(response.body.subarray(0, 4).toString()).toBe('%PDF')
    expect(response.body.toString('latin1')).toContain('/FontFile2')
    expect(response.body.toString('latin1')).toContain('/Subtype /Image')
    expect(await AuditLog.exists({ action: 'report.summary.export', resourceId: patient._id })).toBeTruthy()
  })

  test('exports formula-safe readings CSV and records the export', async () => {
    const response = await request(app)
      .get(`/api/reports/patients/${patient._id}/readings.csv`)
      .set('Authorization', bearer(patientUser))

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('text/csv')
    expect(response.text).toContain('recordedAt,type,systolic')
    expect(response.text).toContain(`"'=2+2"`)
    expect(await AuditLog.exists({ action: 'report.readings.export', resourceId: patient._id })).toBeTruthy()
  })

  test('denies a patient access to another patient report', async () => {
    const otherPatient = await Patient.create({
      name: 'Other patient',
      village: 'Tenali',
    })

    const response = await request(app)
      .get(`/api/reports/patients/${otherPatient._id}/summary`)
      .set('Authorization', bearer(patientUser))

    expect(response.status).toBe(403)
  })

  test('restricts administrative report downloads to admins', async () => {
    const response = await request(app)
      .get('/api/reports/admin.csv')
      .set('Authorization', bearer(patientUser))

    expect(response.status).toBe(403)
  })

  test('exports aggregated admin reports as CSV and audits the export', async () => {
    const response = await request(app)
      .get('/api/reports/admin.csv')
      .set('Authorization', bearer(adminUser))

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('text/csv')
    expect(response.text).toContain('patients_per_village')
    expect(response.text).toContain('Mangalagiri')
    expect(await AuditLog.exists({
      action: 'report.admin.export',
      resourceType: 'SystemReport',
      actor: adminUser._id,
    })).toBeTruthy()
  })
})
