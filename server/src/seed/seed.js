import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { connectMongo, disconnectMongo } from '../config/db.js'
import { env } from '../config/env.js'
import Chw from '../models/Chw.js'
import Doctor from '../models/Doctor.js'
import HealthCentre from '../models/HealthCentre.js'
import LandingPoint from '../models/LandingPoint.js'
import Patient from '../models/Patient.js'
import User from '../models/User.js'

const seedConfig = z.object({
  SEED_PASSWORD: z.string().min(12),
}).safeParse(process.env)

if (!seedConfig.success) {
  throw new Error('Set SEED_PASSWORD to a local-only password of at least 12 characters before running the seed.')
}
if (env.nodeEnv === 'production') {
  throw new Error('The development seed must not run in production.')
}

const seedPasswordHash = await bcrypt.hash(seedConfig.data.SEED_PASSWORD, 12)

async function upsertUser({ name, phone, email, role }) {
  return User.findOneAndUpdate(
    { phone },
    {
      $set: {
        name,
        email,
        role,
        passwordHash: seedPasswordHash,
        language: 'en',
        isActive: true,
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  )
}

async function upsertProfile(Model, user, values) {
  return Model.findOneAndUpdate(
    { user: user._id },
    { $set: values },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  )
}

async function seed() {
  await connectMongo()

  const admin = await upsertUser({
    name: 'Demo Administrator',
    phone: '9000000001',
    email: 'admin@chronic-care.invalid',
    role: 'admin',
  })

  const doctorUsers = await Promise.all([
    upsertUser({ name: 'Dr. Anitha Rao', phone: '9000000002', email: 'doctor1@chronic-care.invalid', role: 'doctor' }),
    upsertUser({ name: 'Dr. Ravi Kumar', phone: '9000000003', email: 'doctor2@chronic-care.invalid', role: 'doctor' }),
    upsertUser({ name: 'Dr. Ramya Varada', phone: '9000000011', email: 'doctor3@chronic-care.invalid', role: 'doctor' }),
    upsertUser({ name: 'Dr. Nanda Kishore Panigrahi', phone: '9000000012', email: 'doctor4@chronic-care.invalid', role: 'doctor' }),
    upsertUser({ name: 'Dr. T. Anusha', phone: '9000000013', email: 'doctor5@chronic-care.invalid', role: 'doctor' }),
  ])
  const demoAvailability = Array.from({ length: 7 }, (_unused, dayOfWeek) => ({
    dayOfWeek,
    startTime: '09:00',
    endTime: '17:00',
    timezone: 'Asia/Kolkata',
  }))
  const doctors = await Promise.all([
    upsertProfile(Doctor, doctorUsers[0], {
      specialization: 'General Medicine',
      registrationNo: 'DEMO-AP-DOC-001',
      hospital: 'Demo District Hospital, Guntur',
      isVerified: true,
    }),
    upsertProfile(Doctor, doctorUsers[1], {
      specialization: 'Cardiology',
      registrationNo: 'DEMO-AP-DOC-002',
      hospital: 'Demo Government Hospital, Vijayawada',
      isVerified: true,
    }),
    ...doctorUsers.slice(2).map((user, index) => upsertProfile(Doctor, user, {
      specialization: ['General Medicine', 'Cardiology', 'General Medicine'][index],
      registrationNo: `DEMO-AP-DOC-00${index + 3}`,
      hospital: 'Demo Care Centre, Andhra Pradesh',
      availability: demoAvailability,
      isVerified: true,
    })),
  ])

  const chwUsers = await Promise.all([
    upsertUser({ name: 'Sita Lakshmi', phone: '9000000004', email: 'chw1@chronic-care.invalid', role: 'chw' }),
    upsertUser({ name: 'Ramesh Babu', phone: '9000000005', email: 'chw2@chronic-care.invalid', role: 'chw' }),
  ])
  const chws = await Promise.all([
    upsertProfile(Chw, chwUsers[0], {
      employeeId: 'DEMO-AP-CHW-001',
      assignedVillages: [
        { village: 'Mangalagiri', mandal: 'Mangalagiri', district: 'Guntur' },
        { village: 'Tenali', mandal: 'Tenali', district: 'Guntur' },
        { village: 'Tadepalli', mandal: 'Tadepalli', district: 'Guntur' },
      ],
      isVerified: true,
    }),
    upsertProfile(Chw, chwUsers[1], {
      employeeId: 'DEMO-AP-CHW-002',
      assignedVillages: [
        { village: 'Poranki', mandal: 'Penamaluru', district: 'Krishna' },
        { village: 'Gannavaram', mandal: 'Gannavaram', district: 'Krishna' },
      ],
      isVerified: true,
    }),
  ])

  const centres = [
    { name: 'Demo PHC Vijayawada', type: 'PHC', address: 'Sample Road, Vijayawada, Andhra Pradesh', phone: '9000000101', services: ['primary care', 'diabetes screening'], hasAmbulance: true, is24x7: false, coordinates: [80.648, 16.506] },
    { name: 'Demo CHC Guntur', type: 'CHC', address: 'Sample Road, Guntur, Andhra Pradesh', phone: '9000000102', services: ['primary care', 'hypertension care'], hasAmbulance: true, is24x7: true, coordinates: [80.4365, 16.3067] },
    { name: 'Demo District Hospital Visakhapatnam', type: 'districtHospital', address: 'Sample Road, Visakhapatnam, Andhra Pradesh', phone: '9000000103', services: ['emergency', 'cardiology'], hasAmbulance: true, is24x7: true, coordinates: [83.2185, 17.6868] },
    { name: 'Demo PHC Tirupati', type: 'PHC', address: 'Sample Road, Tirupati, Andhra Pradesh', phone: '9000000104', services: ['primary care', 'diabetes screening'], hasAmbulance: false, is24x7: false, coordinates: [79.4192, 13.6288] },
    { name: 'Demo CHC Nellore', type: 'CHC', address: 'Sample Road, Nellore, Andhra Pradesh', phone: '9000000105', services: ['primary care', 'hypertension care'], hasAmbulance: true, is24x7: true, coordinates: [79.9864, 14.4426] },
    { name: 'Demo PHC Kurnool', type: 'PHC', address: 'Sample Road, Kurnool, Andhra Pradesh', phone: '9000000106', services: ['primary care'], hasAmbulance: false, is24x7: false, coordinates: [78.0373, 15.8281] },
    { name: 'Demo CHC Rajahmundry', type: 'CHC', address: 'Sample Road, Rajahmundry, Andhra Pradesh', phone: '9000000107', services: ['primary care', 'cardiac screening'], hasAmbulance: true, is24x7: true, coordinates: [81.804, 17.0005] },
    { name: 'Demo PHC Kadapa', type: 'PHC', address: 'Sample Road, Kadapa, Andhra Pradesh', phone: '9000000108', services: ['primary care'], hasAmbulance: false, is24x7: false, coordinates: [78.8242, 14.4673] },
    { name: 'Demo CHC Anantapur', type: 'CHC', address: 'Sample Road, Anantapur, Andhra Pradesh', phone: '9000000109', services: ['primary care', 'diabetes screening'], hasAmbulance: true, is24x7: true, coordinates: [77.6006, 14.6819] },
    { name: 'Demo PHC Eluru', type: 'PHC', address: 'Sample Road, Eluru, Andhra Pradesh', phone: '9000000110', services: ['primary care'], hasAmbulance: false, is24x7: false, coordinates: [81.0952, 16.7107] },
  ]

  const centreDocs = await Promise.all(centres.map((centre) => HealthCentre.findOneAndUpdate(
    { name: centre.name },
    {
      $set: {
        name: centre.name,
        type: centre.type,
        address: centre.address,
        phone: centre.phone,
        services: centre.services,
        hasAmbulance: centre.hasAmbulance,
        is24x7: centre.is24x7,
        location: { type: 'Point', coordinates: centre.coordinates },
        isActive: true,
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  )))

  const landingPoints = [
    { village: 'Mangalagiri', name: 'Demo Mangalagiri Open Ground', contactPerson: 'Demo Village Contact 1', phone: '9000000201', coordinates: [80.56, 16.43] },
    { village: 'Tenali', name: 'Demo Tenali Field Point', contactPerson: 'Demo Village Contact 2', phone: '9000000202', coordinates: [80.64, 16.24] },
    { village: 'Poranki', name: 'Demo Poranki Community Ground', contactPerson: 'Demo Village Contact 3', phone: '9000000203', coordinates: [80.69, 16.48] },
    { village: 'Gannavaram', name: 'Demo Gannavaram Open Area', contactPerson: 'Demo Village Contact 4', phone: '9000000204', coordinates: [80.80, 16.54] },
    { village: 'Tadepalli', name: 'Demo Tadepalli Field Point', contactPerson: 'Demo Village Contact 5', phone: '9000000205', coordinates: [80.60, 16.48] },
  ]

  await Promise.all(landingPoints.map((point) => LandingPoint.findOneAndUpdate(
    { name: point.name },
    {
      $set: {
        ...point,
        location: { type: 'Point', coordinates: point.coordinates },
        surfaceType: 'open_ground',
        obstructionsNotes: 'Illustrative demo record; inspect and verify before any operational use.',
        isActive: false,
        noFly: false,
      },
      $setOnInsert: { verifiedAt: null, verifiedBy: null },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  )))

  const patientSeeds = [
    { name: 'Demo Patient One', phone: '9000000006', village: 'Mangalagiri', mandal: 'Mangalagiri', district: 'Guntur', conditions: ['diabetes'], gender: 'female', coordinates: [80.56, 16.43], doctorIndex: 0, chwIndex: 0, centreIndex: 0 },
    { name: 'Demo Patient Two', phone: '9000000007', village: 'Tenali', mandal: 'Tenali', district: 'Guntur', conditions: ['hypertension'], gender: 'male', coordinates: [80.64, 16.24], doctorIndex: 0, chwIndex: 0, centreIndex: 1 },
    { name: 'Demo Patient Three', phone: '9000000008', village: 'Poranki', mandal: 'Penamaluru', district: 'Krishna', conditions: ['cardiac'], gender: 'female', coordinates: [80.69, 16.48], doctorIndex: 1, chwIndex: 1, centreIndex: 0 },
    { name: 'Demo Patient Four', phone: '9000000009', village: 'Gannavaram', mandal: 'Gannavaram', district: 'Krishna', conditions: ['diabetes', 'hypertension'], gender: 'male', coordinates: [80.80, 16.54], doctorIndex: 1, chwIndex: 1, centreIndex: 0 },
    { name: 'Demo Patient Five', phone: '9000000010', village: 'Tadepalli', mandal: 'Tadepalli', district: 'Guntur', conditions: ['hypertension'], gender: 'prefer_not_to_say', coordinates: [80.60, 16.48], doctorIndex: 0, chwIndex: 0, centreIndex: 0 },
  ]

  const patientUsers = await Promise.all(patientSeeds.map((patient) => upsertUser({
    name: patient.name,
    phone: patient.phone,
    email: `${patient.phone}@chronic-care.invalid`,
    role: 'patient',
  })))

  await Promise.all(patientSeeds.map((patient, index) => upsertProfile(Patient, patientUsers[index], {
    age: 45 + index,
    gender: patient.gender,
    village: patient.village,
    mandal: patient.mandal,
    district: patient.district,
    location: { type: 'Point', coordinates: patient.coordinates },
    conditions: patient.conditions,
    assignedDoctor: doctors[patient.doctorIndex]._id,
    assignedChw: chws[patient.chwIndex]._id,
    nearestHealthCentre: centreDocs[patient.centreIndex]._id,
    status: 'active',
    consent: {
      status: 'accepted',
      policyVersion: 'demo-seed-v1',
      acceptedAt: new Date(),
      capturedBy: patientUsers[index]._id,
      method: 'self',
    },
  })))

  console.info('Development seed completed.', {
    users: 1 + doctorUsers.length + chwUsers.length + patientUsers.length,
    doctors: doctors.length,
    chws: chws.length,
    patients: patientUsers.length,
    healthCentres: centreDocs.length,
    landingPoints: landingPoints.length,
    demoPhoneNumbers: [
      admin.phone,
      ...doctorUsers.map((user) => user.phone),
      ...chwUsers.map((user) => user.phone),
      ...patientUsers.map((user) => user.phone),
    ],
    passwordSource: 'SEED_PASSWORD environment variable (not printed)',
  })
}

try {
  await seed()
} catch (error) {
  console.error('Development seed failed.', {
    message: error.message,
    name: error.name,
  })
  process.exitCode = 1
} finally {
  await disconnectMongo()
}
