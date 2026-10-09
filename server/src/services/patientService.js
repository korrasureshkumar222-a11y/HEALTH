import AuditLog from '../models/AuditLog.js'
import Chw from '../models/Chw.js'
import Doctor from '../models/Doctor.js'
import HealthCentre from '../models/HealthCentre.js'
import HealthRecord from '../models/HealthRecord.js'
import Patient from '../models/Patient.js'
import User from '../models/User.js'
import ApiError from '../utils/ApiError.js'
import { canRegisterPatientInVillage } from './permissions.js'

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function throwIfDuplicate(error) {
  if (error?.code === 11000) {
    throw new ApiError(409, 'A patient profile or phone number already exists.', 'PATIENT_EXISTS')
  }
  throw error
}

async function patientScope(user) {
  if (user.role === 'admin') return {}
  if (user.role === 'patient') return { user: user._id }
  if (user.role === 'doctor') {
    const doctor = await Doctor.findOne({ user: user._id }).select('_id').lean()
    return doctor ? { assignedDoctor: doctor._id } : { _id: null }
  }
  if (user.role === 'chw') {
    const chw = await Chw.findOne({ user: user._id }).select('assignedVillages').lean()
    const villages = chw?.assignedVillages ?? []
    if (!villages.length) return { _id: null }
    return {
      $or: villages.map((location) => ({
        village: new RegExp(`^${escapeRegex(location.village)}$`, 'i'),
        ...(location.mandal ? { mandal: new RegExp(`^${escapeRegex(location.mandal)}$`, 'i') } : {}),
        ...(location.district ? { district: new RegExp(`^${escapeRegex(location.district)}$`, 'i') } : {}),
      })),
    }
  }
  return { _id: null }
}

async function nearestHealthCentre(location) {
  if (!location) return undefined
  const centre = await HealthCentre.findOne({
    isActive: true,
    location: { $near: { $geometry: location } },
  }).select('_id').lean()
  return centre?._id ?? null
}

async function logPatientChange(user, patient, action, changedFields) {
  await AuditLog.create({
    actor: user._id,
    actorRole: user.role,
    action,
    resourceId: patient._id,
    changedFields: [...new Set(changedFields)].sort(),
  })
}

export async function listPatients(user, filters) {
  const scope = await patientScope(user)
  if (user.role !== 'admin' && filters.status === 'inactive') {
    throw new ApiError(403, 'Only administrators can list inactive patients.', 'FORBIDDEN')
  }
  const patientMatch = { ...scope, status: filters.status ?? 'active' }
  if (filters.village) patientMatch.village = new RegExp(escapeRegex(filters.village), 'i')
  if (filters.mandal) patientMatch.mandal = new RegExp(escapeRegex(filters.mandal), 'i')
  if (filters.district) patientMatch.district = new RegExp(escapeRegex(filters.district), 'i')
  if (filters.condition) patientMatch.conditions = filters.condition
  if (filters.status) patientMatch.status = filters.status

  const searchText = filters.search ?? filters.q
  const search = searchText
    ? new RegExp(escapeRegex(searchText), 'i')
    : null
  const pipeline = [
    { $match: patientMatch },
    {
      $lookup: {
        from: User.collection.name,
        localField: 'user',
        foreignField: '_id',
        pipeline: [{ $project: { name: 1, phone: 1 } }],
        as: 'account',
      },
    },
    { $unwind: { path: '$account', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: HealthRecord.collection.name,
        let: { patientId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$patient', '$$patientId'] } } },
          { $sort: { recordedAt: -1, _id: -1 } },
          { $limit: 1 },
          { $project: { status: 1, recordedAt: 1 } },
        ],
        as: 'latestReading',
      },
    },
    { $unwind: { path: '$latestReading', preserveNullAndEmptyArrays: true } },
  ]
  if (search) {
    pipeline.push({
      $match: {
        $or: [
          { 'account.name': search },
          { 'account.phone': search },
          { phone: search },
          { village: search },
          { mandal: search },
          { district: search },
        ],
      },
    })
  }
  if (filters.risk) {
    pipeline.push(filters.risk === 'unclassified'
      ? { $match: { $or: [{ 'latestReading.status': 'unclassified' }, { latestReading: { $exists: false } }] } }
      : { $match: { 'latestReading.status': filters.risk } })
  }

  const skip = (filters.page - 1) * filters.limit
  pipeline.push({
    $facet: {
      items: [
        { $sort: { updatedAt: -1, _id: 1 } },
        { $skip: skip },
        { $limit: filters.limit },
        {
          $project: {
            user: '$account',
            phone: { $ifNull: ['$account.phone', '$phone'] },
            name: { $ifNull: ['$account.name', '$name'] },
            age: 1,
            gender: 1,
            village: 1,
            mandal: 1,
            district: 1,
            conditions: 1,
            assignedDoctor: 1,
            assignedChw: 1,
            nearestHealthCentre: 1,
            status: 1,
            updatedAt: 1,
            latestReading: 1,
          },
        },
      ],
      totals: [{ $count: 'total' }],
    },
  })

  const [result] = await Patient.aggregate(pipeline)
  const total = result?.totals[0]?.total ?? 0
  return {
    items: result?.items ?? [],
    page: filters.page,
    limit: filters.limit,
    total,
    hasMore: skip + (result?.items.length ?? 0) < total,
  }
}

export async function createPatient(user, input) {
  if (user.role === 'chw' && !await canRegisterPatientInVillage(user, input)) {
    throw new ApiError(403, 'You can register patients only in your assigned villages.', 'FORBIDDEN')
  }

  const [existingAccount, existingProfile] = await Promise.all([
    User.findOne({ phone: input.phone }).select('_id role'),
    Patient.findOne({ phone: input.phone }).select('_id'),
  ])
  if (existingProfile) {
    throw new ApiError(409, 'A patient profile already exists for this phone number.', 'PATIENT_EXISTS')
  }
  if (existingAccount) {
    throw new ApiError(409, 'This phone number already has an account. Ask the patient to register or contact an administrator.', 'ACCOUNT_EXISTS')
  }

  const doctorChw = user.role === 'chw'
    ? await Chw.findOne({ user: user._id }).select('_id').lean()
    : null
  const profile = {
    clientId: input.clientId,
    name: input.name,
    phone: input.phone,
    age: input.age,
    gender: input.gender,
    village: input.village,
    mandal: input.mandal,
    district: input.district,
    location: input.location,
    conditions: input.conditions ?? [],
    bloodGroup: input.bloodGroup,
    allergies: input.allergies ?? [],
    emergencyContacts: input.emergencyContacts ?? [],
    nearestHealthCentre: await nearestHealthCentre(input.location),
    consent: {
      status: 'accepted',
      policyVersion: input.consent.policyVersion,
      acceptedAt: new Date(),
      capturedBy: user._id,
      method: user.role === 'chw' ? 'chw' : 'admin',
    },
    ...(doctorChw ? { assignedChw: doctorChw._id } : {}),
  }
  let patient
  try {
    patient = await Patient.create(profile)
  } catch (error) {
    throwIfDuplicate(error)
  }
  await logPatientChange(user, patient, 'patient.create', Object.keys(profile))
  return Patient.findById(patient._id).populate('user', 'name phone language').lean()
}

export async function updatePatient(user, patientId, input) {
  const patient = await Patient.findById(patientId)
  if (!patient) throw new ApiError(404, 'Patient not found.', 'NOT_FOUND')
  const changedFields = Object.keys(input)
  const userChanges = {}
  const allowedFieldsByRole = {
    patient: new Set(['name', 'phone', 'village', 'mandal', 'district', 'location', 'allergies', 'emergencyContacts']),
    doctor: new Set(['name', 'age', 'gender', 'conditions', 'bloodGroup', 'allergies', 'emergencyContacts']),
    chw: new Set(['name', 'age', 'gender', 'village', 'mandal', 'district', 'location', 'conditions', 'bloodGroup', 'allergies', 'emergencyContacts']),
    admin: new Set(['name', 'phone', 'age', 'gender', 'village', 'mandal', 'district', 'location', 'conditions', 'bloodGroup', 'allergies', 'emergencyContacts']),
  }
  const disallowed = changedFields.filter((field) => !allowedFieldsByRole[user.role]?.has(field))
  if (disallowed.length) {
    throw new ApiError(403, 'You are not allowed to update these patient fields.', 'FORBIDDEN')
  }
  if (user.role === 'chw' && !await canRegisterPatientInVillage(user, {
    village: input.village ?? patient.village,
    mandal: input.mandal ?? patient.mandal,
    district: input.district ?? patient.district,
  })) {
    throw new ApiError(403, 'You can update a patient only within your assigned villages.', 'FORBIDDEN')
  }

  if (input.name !== undefined) {
    userChanges.name = input.name
    patient.name = input.name
    delete input.name
  }
  if (input.phone !== undefined) {
    const currentAccount = patient.user
      ? await User.findById(patient.user).select('phone').lean()
      : null
    const currentPhone = patient.phone ?? currentAccount?.phone
    if (user.role !== 'admin' && input.phone !== currentPhone) {
      throw new ApiError(403, 'Only administrators can change a patient phone number.', 'FORBIDDEN')
    }
    const userFilter = patient.user ? { _id: { $ne: patient.user } } : {}
    const [existingUser, existingPatient] = await Promise.all([
      User.findOne({ phone: input.phone, ...userFilter }).select('_id'),
      Patient.findOne({ phone: input.phone, _id: { $ne: patient._id } }).select('_id'),
    ])
    if (existingUser || existingPatient) {
      throw new ApiError(409, 'This phone number is already in use.', 'ACCOUNT_EXISTS')
    }
    userChanges.phone = input.phone
    patient.phone = input.phone
    delete input.phone
  }

  Object.assign(patient, input)
  if (input.location !== undefined) {
    patient.nearestHealthCentre = await nearestHealthCentre(input.location)
  }
  try {
    await patient.save()
  } catch (error) {
    throwIfDuplicate(error)
  }

  if (patient.user && Object.keys(userChanges).length) {
    await User.updateOne({ _id: patient.user }, { $set: userChanges })
  }
  await logPatientChange(user, patient, 'patient.update', changedFields)
  return Patient.findById(patient._id).populate('user', 'name phone language').lean()
}

export async function assignPatient(user, patientId, input) {
  const patient = await Patient.findById(patientId)
  if (!patient) throw new ApiError(404, 'Patient not found.', 'NOT_FOUND')
  const changedFields = []

  if (Object.hasOwn(input, 'doctorId')) {
    const doctor = input.doctorId
      ? await Doctor.findById(input.doctorId).populate('user', 'isActive')
      : null
    if (input.doctorId && (!doctor || !doctor.user?.isActive)) {
      throw new ApiError(400, 'Selected doctor does not exist or is inactive.', 'INVALID_ASSIGNMENT')
    }
    patient.assignedDoctor = input.doctorId ?? undefined
    changedFields.push('assignedDoctor')
  }
  if (Object.hasOwn(input, 'chwId')) {
    const chw = input.chwId
      ? await Chw.findById(input.chwId).populate('user', 'isActive')
      : null
    if (input.chwId && (!chw || !chw.user?.isActive)) {
      throw new ApiError(400, 'Selected CHW does not exist or is inactive.', 'INVALID_ASSIGNMENT')
    }
    patient.assignedChw = input.chwId ?? undefined
    changedFields.push('assignedChw')
  }

  await patient.save()
  await logPatientChange(user, patient, 'patient.assign', changedFields)
  const assignedPatient = await Patient.findById(patient._id)
    .populate('user', 'name phone')
    .populate('assignedDoctor', 'user')
    .populate('assignedChw', 'user')
    .lean()
  return {
    ...assignedPatient,
    assignedDoctor: assignedPatient?.assignedDoctor ?? null,
    assignedChw: assignedPatient?.assignedChw ?? null,
  }
}

export async function listAssignableStaff() {
  const [doctorProfiles, chwProfiles] = await Promise.all([
    Doctor.find().populate('user', 'name phone isActive').sort({ createdAt: -1 }).lean(),
    Chw.find().populate('user', 'name phone isActive').sort({ createdAt: -1 }).lean(),
  ])
  const doctors = doctorProfiles.filter((doctor) => doctor.user?.isActive)
  const chws = chwProfiles.filter((chw) => chw.user?.isActive)
  return { doctors, chws }
}

export async function deactivatePatient(user, patientId) {
  const patient = await Patient.findById(patientId)
  if (!patient) throw new ApiError(404, 'Patient not found.', 'NOT_FOUND')
  if (patient.status === 'inactive') {
    throw new ApiError(409, 'Patient is already inactive.', 'INVALID_STATE_TRANSITION')
  }

  patient.status = 'inactive'
  await patient.save()
  if (patient.user) {
    await User.updateOne(
      { _id: patient.user },
      { $set: { isActive: false, refreshTokens: [] } },
    )
  }
  await logPatientChange(user, patient, 'patient.deactivate', ['status'])
  return patient
}
