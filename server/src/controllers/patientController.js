import mongoose from 'mongoose'
import HealthRecord from '../models/HealthRecord.js'
import Patient from '../models/Patient.js'
import ApiError from '../utils/ApiError.js'
import {
  createReading,
  createReadingsBatch,
  deleteReading,
  getReadingSeries,
  listReadings,
} from '../services/readingService.js'
import { createReadingSchema } from '../validators/readingValidators.js'
import {
  assignPatient,
  createPatient,
  deactivatePatient,
  listPatients,
  listAssignableStaff,
  updatePatient,
} from '../services/patientService.js'

export async function listPatientRecords(request, response) {
  const result = await listPatients(request.user, request.query)
  response.status(200).json({
    success: true,
    message: 'Patients retrieved.',
    data: result,
  })
}

export async function getAssignableStaff(_request, response) {
  const staff = await listAssignableStaff()
  response.status(200).json({
    success: true,
    message: 'Assignable staff retrieved.',
    data: staff,
  })
}

export async function createPatientRecord(request, response) {
  const patient = await createPatient(request.user, request.body)
  response.status(201).json({
    success: true,
    message: 'Patient registered.',
    data: { patient },
  })
}

export async function getPatient(request, response) {
  if (!mongoose.isValidObjectId(request.params.patientId)) {
    throw new ApiError(404, 'Patient not found.', 'NOT_FOUND')
  }

  const patient = await Patient.findById(request.params.patientId)
    .populate('user', 'name phone language')
    .populate({ path: 'assignedDoctor', select: 'user specialization hospital', populate: { path: 'user', select: 'name phone' } })
    .populate({ path: 'assignedChw', select: 'user employeeId', populate: { path: 'user', select: 'name phone' } })
    .populate('nearestHealthCentre', 'name type address phone')
    .lean()
  if (!patient) throw new ApiError(404, 'Patient not found.', 'NOT_FOUND')

  const latestReading = await HealthRecord.findOne({ patient: patient._id })
    .sort({ recordedAt: -1, _id: -1 })
    .select('type values status recordedAt')
    .lean()

  response.status(200).json({
    success: true,
    message: 'Patient retrieved.',
    data: { patient: { ...patient, name: patient.user?.name ?? patient.name, latestReading } },
  })
}

export async function getOwnPatient(request, response) {
  const profile = await Patient.findOne({ user: request.user._id }).select('_id').lean()
  if (!profile) throw new ApiError(404, 'Patient profile not found.', 'NOT_FOUND')
  request.params.patientId = profile._id.toString()
  return getPatient(request, response)
}

export async function updatePatientRecord(request, response) {
  const patient = await updatePatient(
    request.user,
    request.params.patientId,
    request.body,
  )
  response.status(200).json({
    success: true,
    message: 'Patient profile updated.',
    data: { patient },
  })
}

export async function assignPatientRecord(request, response) {
  const patient = await assignPatient(
    request.user,
    request.params.patientId,
    request.body,
  )
  response.status(200).json({
    success: true,
    message: 'Patient assignments updated.',
    data: { patient },
  })
}

export async function deactivatePatientRecord(request, response) {
  const patient = await deactivatePatient(request.user, request.params.patientId)
  response.status(200).json({
    success: true,
    message: 'Patient deactivated.',
    data: { patient: { id: patient._id, status: patient.status } },
  })
}

export async function getPatientReadings(request, response) {
  if (!mongoose.isValidObjectId(request.params.patientId)) {
    throw new ApiError(404, 'Patient not found.', 'NOT_FOUND')
  }

  const result = await listReadings(request.params.patientId, request.query)

  response.status(200).json({
    success: true,
    message: 'Patient readings retrieved.',
    data: result,
  })
}

export async function getPatientReadingSeries(request, response) {
  if (!mongoose.isValidObjectId(request.params.patientId)) {
    throw new ApiError(404, 'Patient not found.', 'NOT_FOUND')
  }
  const result = await getReadingSeries(request.params.patientId, request.query)
  response.status(200).json({
    success: true,
    message: 'Patient reading series retrieved.',
    data: result,
  })
}

export async function createReadingRecord(request, response) {
  const result = await createReading(request.user, request.body)
  response.status(result.duplicate ? 200 : 201).json({
    success: true,
    message: result.duplicate ? 'Reading already recorded.' : 'Reading recorded.',
    data: {
      record: result.record,
      alert: result.alert,
      duplicate: result.duplicate,
    },
  })
}

export async function createReadingBatch(request, response) {
  const results = await createReadingsBatch(
    request.user,
    request.body.items,
    (item) => createReadingSchema.safeParse(item),
  )
  response.status(200).json({
    success: true,
    message: 'Reading synchronization processed.',
    data: { results, serverTime: new Date() },
  })
}

export async function deleteReadingRecord(request, response) {
  if (!mongoose.isValidObjectId(request.params.patientId)
    || !mongoose.isValidObjectId(request.params.recordId)) {
    throw new ApiError(404, 'Reading not found.', 'NOT_FOUND')
  }
  await deleteReading(
    request.user,
    request.params.patientId,
    request.params.recordId,
    request.body.reason,
  )
  response.status(204).end()
}

export async function getPatientReading(request, response) {
  const { patientId, recordId } = request.params
  if (!mongoose.isValidObjectId(patientId) || !mongoose.isValidObjectId(recordId)) {
    throw new ApiError(404, 'Reading not found.', 'NOT_FOUND')
  }

  const record = await HealthRecord.findOne({ _id: recordId, patient: patientId }).lean()
  if (!record) throw new ApiError(404, 'Reading not found.', 'NOT_FOUND')

  response.status(200).json({
    success: true,
    message: 'Patient reading retrieved.',
    data: { record },
  })
}
