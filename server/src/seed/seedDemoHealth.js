import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { z } from 'zod'
import { connectMongo, disconnectMongo } from '../config/db.js'
import { env } from '../config/env.js'
import HealthRecord from '../models/HealthRecord.js'
import Patient from '../models/Patient.js'
import User from '../models/User.js'
import { classifyReading } from '../services/classifier.js'

const seedConfig = z.object({
  SEED_PASSWORD: z.string().min(12),
}).safeParse(process.env)

if (!seedConfig.success) {
  throw new Error('Set SEED_PASSWORD to a local-only password of at least 12 characters before running the demo health seed.')
}
if (env.nodeEnv !== 'development') {
  throw new Error('The demo health seed is restricted to development.')
}

const patientSeeds = [
  { name: 'Demo Patient One', phone: '9000000006', village: 'Mangalagiri', mandal: 'Mangalagiri', district: 'Guntur', conditions: ['diabetes'], gender: 'female' },
  { name: 'Demo Patient Two', phone: '9000000007', village: 'Tenali', mandal: 'Tenali', district: 'Guntur', conditions: ['hypertension'], gender: 'male' },
  { name: 'Demo Patient Three', phone: '9000000008', village: 'Poranki', mandal: 'Penamaluru', district: 'Krishna', conditions: ['cardiac'], gender: 'female' },
  { name: 'Demo Patient Four', phone: '9000000009', village: 'Gannavaram', mandal: 'Gannavaram', district: 'Krishna', conditions: ['diabetes', 'hypertension'], gender: 'male' },
  { name: 'Demo Patient Five', phone: '9000000010', village: 'Tadepalli', mandal: 'Tadepalli', district: 'Guntur', conditions: ['hypertension'], gender: 'prefer_not_to_say' },
]

function demoClientId(phone, type, week) {
  const bytes = createHash('sha256')
    .update(`chronic-care-demo-health-v1:${phone}:${type}:${week}`)
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function readingsFor(patient, patientIndex, userId, now) {
  const entries = []
  for (let week = 0; week < 4; week += 1) {
    const recordedAt = new Date(now.getTime() - (28 - week * 7) * 24 * 60 * 60 * 1000)
    const offset = patientIndex + week
    const readings = [
      {
        type: 'bp',
        values: {
          systolic: 118 + (offset % 7),
          diastolic: 72 + (offset % 8),
          unit: 'mmHg',
        },
      },
      {
        type: 'heartRate',
        values: { value: 68 + (offset % 12), unit: 'bpm' },
      },
      {
        type: 'weight',
        values: { value: 58 + patientIndex * 3 + week * 0.2, unit: 'kg' },
      },
      {
        type: 'spo2',
        values: { value: 96 + (offset % 3), unit: '%' },
      },
    ]

    if (patient.conditions.includes('diabetes')) {
      readings.push({
        type: 'sugar',
        values: {
          value: 94 + ((patientIndex * 3 + week * 5) % 27),
          unit: 'mg/dL',
          sugarContext: 'fasting',
        },
      })
    }

    for (const reading of readings) {
      const classification = classifyReading(reading)
      entries.push({
        updateOne: {
          filter: { clientId: demoClientId(patient.phone, reading.type, week) },
          update: {
            $set: {
              patient: patient._id,
              type: reading.type,
              values: reading.values,
              recordedAt,
              recordedBy: userId,
              source: 'self',
              status: classification.status,
              classification: {
                rulesetVersion: classification.rulesetVersion,
                classifiedAt: classification.classifiedAt,
              },
              notes: 'Synthetic demo record; not real patient data.',
            },
            $setOnInsert: {
              clientId: demoClientId(patient.phone, reading.type, week),
            },
          },
          upsert: true,
        },
      })
    }
  }
  return entries
}

async function seedDemoHealth() {
  if (!env.mongoUri) throw new Error('MONGO_URI is required before running the demo health seed.')
  await connectMongo()

  if (!['localhost', '127.0.0.1', '::1'].includes(mongoose.connection.host)
    || mongoose.connection.name !== 'chronic-care') {
    throw new Error('Demo health records may only be seeded into the local chronic-care database.')
  }

  const phones = patientSeeds.map(({ phone }) => phone)
  const existingUsers = await User.find({ phone: { $in: phones } }).select('phone role').lean()
  if (existingUsers.some((user) => user.role !== 'patient')) {
    throw new Error('A reserved demo patient phone is already assigned to a non-patient account; no demo records were written.')
  }
  const demoUserIds = new Set(existingUsers.map((user) => user._id.toString()))
  const existingPatients = await Patient.find({ phone: { $in: phones } }).select('phone user').lean()
  if (existingPatients.some((patient) => !patient.user || !demoUserIds.has(patient.user.toString()))) {
    throw new Error('A reserved demo patient phone is already assigned to an unrelated patient profile; no demo records were written.')
  }

  const passwordHash = await bcrypt.hash(seedConfig.data.SEED_PASSWORD, 12)
  const now = new Date()
  let readingCount = 0

  for (let index = 0; index < patientSeeds.length; index += 1) {
    const seed = patientSeeds[index]
    const user = await User.findOneAndUpdate(
      { phone: seed.phone },
      {
        $set: {
          name: seed.name,
          email: `${seed.phone}@chronic-care.invalid`,
          passwordHash,
          role: 'patient',
          language: index % 2 === 0 ? 'en' : 'te',
          isActive: true,
          consent: {
            status: 'accepted',
            policyVersion: 'demo-seed-v1',
            acceptedAt: now,
          },
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    )

    const patient = await Patient.findOneAndUpdate(
      { user: user._id },
      {
        $set: {
          name: seed.name,
          phone: seed.phone,
          age: 45 + index,
          gender: seed.gender,
          village: seed.village,
          mandal: seed.mandal,
          district: seed.district,
          conditions: seed.conditions,
          status: 'active',
          consent: {
            status: 'accepted',
            policyVersion: 'demo-seed-v1',
            acceptedAt: now,
            capturedBy: user._id,
            method: 'self',
          },
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    )

    const operations = readingsFor(patient, index, user._id, now)
    const result = await HealthRecord.bulkWrite(operations, { ordered: true })
    readingCount += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0)
  }

  console.info('Synthetic demo health history seeded.', {
    patients: patientSeeds.length,
    healthRecords: readingCount,
    historyDays: 28,
    passwordSource: 'SEED_PASSWORD environment variable (not printed)',
  })
}

try {
  await seedDemoHealth()
} catch (error) {
  console.error('Demo health seed failed.', {
    message: error.message,
    name: error.name,
  })
  process.exitCode = 1
} finally {
  await disconnectMongo()
}
