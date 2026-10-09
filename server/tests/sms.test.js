import { createHmac } from 'node:crypto'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import Alert from '../src/models/Alert.js'
import Chw from '../src/models/Chw.js'
import Doctor from '../src/models/Doctor.js'
import HealthRecord from '../src/models/HealthRecord.js'
import Notification from '../src/models/Notification.js'
import Patient from '../src/models/Patient.js'
import SmsLog from '../src/models/SmsLog.js'
import SmsRateLimit from '../src/models/SmsRateLimit.js'
import SosIncident from '../src/models/SosIncident.js'
import User from '../src/models/User.js'
import { configureSmsProvider } from '../src/services/smsService.js'
import { MockSmsProvider } from '../src/services/smsProviders.js'

const webhookUrl = process.env.SMS_WEBHOOK_URL
const authToken = process.env.TWILIO_AUTH_TOKEN
let mongo
let patientUser
let patient

function twilioSignature(parameters) {
  const canonical = Object.keys(parameters)
    .sort()
    .reduce((value, key) => `${value}${key}${parameters[key]}`, webhookUrl)
  return createHmac('sha1', authToken).update(canonical).digest('base64')
}

function sendInbound(parameters, signature = twilioSignature(parameters)) {
  return request(app)
    .post('/api/sms/inbound')
    .type('form')
    .set('X-Twilio-Signature', signature)
    .send(parameters)
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await Promise.all([
    User.init(),
    Patient.init(),
    HealthRecord.init(),
    Alert.init(),
    SosIncident.init(),
    Notification.init(),
    SmsLog.init(),
    SmsRateLimit.init(),
    Doctor.init(),
    Chw.init(),
  ])
})

beforeEach(async () => {
  configureSmsProvider(new MockSmsProvider())
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  )
  patientUser = await User.create({
    name: 'SMS Test Patient',
    phone: '9876501199',
    passwordHash: 'sms-test-password',
    role: 'patient',
    language: 'te',
  })
  patient = await Patient.create({
    user: patientUser._id,
    name: patientUser.name,
    phone: patientUser.phone,
    language: 'te',
    village: 'SMS Village',
    location: { type: 'Point', coordinates: [80.4, 16.4] },
  })
  await User.create({
    name: 'SMS Admin',
    phone: '9876501198',
    passwordHash: 'sms-test-password',
    role: 'admin',
  })
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('Inbound SMS webhook', () => {
  test('verifies provider signature, stores BP reading as SMS, and replies in Telugu', async () => {
    const parameters = {
      From: '+919876501199',
      To: '+15005550006',
      Body: 'bP: 120/80 mmHg',
      MessageSid: 'SM-readable-reading-1',
    }
    const response = await sendInbound(parameters).expect(200)
    expect(response.text).toContain('<Response/>')

    const record = await HealthRecord.findOne({ patient: patient._id }).lean()
    expect(record).toMatchObject({
      type: 'bp',
      source: 'sms',
      recordedBy: patientUser._id,
      status: 'normal',
      values: { systolic: 120, diastolic: 80, unit: 'mmHg' },
    })
    const inbound = await SmsLog.findOne({ direction: 'inbound' }).lean()
    expect(inbound).toMatchObject({
      fromPhoneHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      patient: patient._id,
      messageType: 'reading',
      purpose: 'inbound_reading',
      status: 'accepted',
      signatureValid: true,
      parsedPayload: { kind: 'reading', type: 'bp', status: 'normal' },
    })
    expect(inbound.bodyRedacted).toContain('[value]')
    expect(inbound.bodyRedacted).not.toContain('120')
    const replyLog = await SmsLog.findOne({ direction: 'outbound' }).lean()
    expect(replyLog.bodyRedacted).toContain('రక్తపోటు')
    expect(replyLog.status).toBe('simulated')
  })

  test('rejects invalid provider signatures and does not save readings', async () => {
    const response = await sendInbound({
      From: '+919876501199',
      Body: 'BP 120 80',
      MessageSid: 'SM-invalid-signature',
    }, 'invalid').expect(403)
    expect(response.body.error.code).toBe('SMS_SIGNATURE_INVALID')
    expect(await HealthRecord.countDocuments()).toBe(0)
    expect(await SmsLog.countDocuments({ signatureValid: false })).toBe(1)
  })

  test('replies to malformed commands, enforces rate limit, and deduplicates provider retries', async () => {
    const malformed = {
      From: '+919876501199',
      Body: 'BP 120/abc',
      MessageSid: 'SM-malformed',
    }
    await sendInbound(malformed).expect(200)
    expect(await HealthRecord.countDocuments()).toBe(0)
    expect(await SmsLog.findOne({ direction: 'inbound' }).lean()).toMatchObject({
      status: 'rejected',
      bodyRedacted: 'BP [value]/abc',
    })

    const duplicateParameters = {
      From: '+919876501199',
      Body: 'HR 88',
      MessageSid: 'SM-retry-same',
    }
    await sendInbound(duplicateParameters).expect(200)
    await sendInbound(duplicateParameters).expect(200)
    expect(await HealthRecord.countDocuments({ patient: patient._id })).toBe(1)
    expect(await SmsLog.countDocuments({ direction: 'inbound', providerMessageId: 'SM-retry-same' })).toBe(1)

    for (let index = 0; index < 4; index += 1) {
      await sendInbound({
        From: '+919876501199',
        Body: 'not a command',
        MessageSid: `SM-rate-${index}`,
      }).expect(200)
    }
    expect(await SmsLog.countDocuments({ status: 'rate_limited' })).toBe(1)
  })

  test('SOS SMS creates an incident and returns a localized confirmation', async () => {
    const response = await sendInbound({
      From: '+919876501199',
      Body: 'sos',
      MessageSid: 'SM-sos',
    }).expect(200)
    expect(response.text).toContain('<Response/>')
    expect(await SosIncident.findOne({ patient: patient._id }).lean()).toMatchObject({
      source: 'sms',
      status: 'triggered',
      location: { coordinates: [80.4, 16.4] },
    })
    expect((await SmsLog.findOne({ direction: 'outbound' }).lean()).bodyRedacted).toContain('SOS అందింది')
  })
})
