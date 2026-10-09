import Appointment from '../models/Appointment.js'
import Alert from '../models/Alert.js'
import Doctor from '../models/Doctor.js'
import HealthRecord from '../models/HealthRecord.js'
import Medication from '../models/Medication.js'
import Note from '../models/Note.js'
import ApiError from '../utils/ApiError.js'
import { createAppointment } from './appointmentService.js'

function paginated(items, page, limit, total) {
  const skip = (page - 1) * limit
  return { items, page, limit, total, hasMore: skip + items.length < total }
}

async function getDoctorProfile(user) {
  const doctor = await Doctor.findOne({ user: user._id }).select('_id').lean()
  if (!doctor) throw new ApiError(404, 'Doctor profile not found.', 'DOCTOR_PROFILE_NOT_FOUND')
  return doctor
}

export async function listPatientNotes(user, patientId, query) {
  const filter = { patient: patientId }
  if (user.role !== 'doctor') filter.visibility = 'careTeam'
  if (query.kind) filter.kind = query.kind
  const skip = (query.page - 1) * query.limit
  const [items, total] = await Promise.all([
    Note.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate('author', 'name role')
      .lean(),
    Note.countDocuments(filter),
  ])
  return paginated(items, query.page, query.limit, total)
}

export async function createPatientNote(user, patientId, input) {
  if (!['doctor', 'chw'].includes(user.role)) {
    throw new ApiError(403, 'Only care-team staff can add patient notes.', 'FORBIDDEN')
  }
  if (input.relatedRecordId && !await HealthRecord.exists({
    _id: input.relatedRecordId,
    patient: patientId,
  })) {
    throw new ApiError(404, 'Related reading not found for this patient.', 'NOT_FOUND')
  }
  return Note.create({
    patient: patientId,
    author: user._id,
    authorRole: user.role,
    kind: input.kind,
    body: input.body,
    visibility: input.visibility,
    relatedRecord: input.relatedRecordId,
  })
}

export async function updatePatientNote(user, patientId, noteId, input) {
  const note = await Note.findOne({ _id: noteId, patient: patientId })
  if (!note) throw new ApiError(404, 'Note not found.', 'NOT_FOUND')
  if (note.author.toString() !== user._id.toString() && user.role !== 'doctor') {
    throw new ApiError(403, 'You cannot edit this note.', 'FORBIDDEN')
  }
  note.revisions.push({
    body: note.body,
    editedAt: new Date(),
    editReason: input.editReason,
  })
  note.body = input.body
  note.editedAt = new Date()
  note.editReason = input.editReason
  await note.save()
  return note
}

export async function listPatientMedications(patientId, query) {
  const filter = { patient: patientId }
  if (query.active !== undefined) filter.active = query.active === 'true'
  if (query.from || query.to) {
    const from = query.from ? new Date(query.from) : new Date(0)
    const to = query.to ? new Date(query.to) : new Date('9999-12-31T23:59:59.999Z')
    filter.startDate = { $lte: to }
    filter.$or = [{ endDate: null }, { endDate: { $gte: from } }]
  }
  return Medication.find(filter).sort({ active: -1, startDate: -1, _id: -1 }).lean()
}

export async function prescribeMedication(user, patientId, input) {
  const doctor = await getDoctorProfile(user)
  return Medication.create({
    ...input,
    patient: patientId,
    prescribedBy: doctor._id,
    active: true,
  })
}

export async function updatePrescription(user, patientId, medicationId, input) {
  const doctor = await getDoctorProfile(user)
  const medication = await Medication.findOne({ _id: medicationId, patient: patientId })
  if (!medication) throw new ApiError(404, 'Medication not found.', 'NOT_FOUND')
  const { reason, ...changes } = input
  const nextStartDate = medication.startDate
  const nextEndDate = changes.endDate === undefined ? medication.endDate : changes.endDate
  if (nextEndDate && nextEndDate < nextStartDate) {
    throw new ApiError(400, 'Medication end date cannot be before its start date.', 'INVALID_MEDICATION_DATES')
  }
  medication.prescriptionHistory.push({
    dose: medication.dose,
    frequency: medication.frequency,
    timings: medication.timings,
    endDate: medication.endDate,
    instructions: medication.instructions,
    active: medication.active,
    prescribedBy: medication.prescribedBy,
    changedBy: user._id,
    changedAt: new Date(),
    reason,
  })
  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined) medication.set(key, value)
  }
  medication.prescribedBy = doctor._id
  await medication.save()
  return medication
}

export async function schedulePatientAppointment(user, patientId, input) {
  return createAppointment(user, { ...input, patientId })
}

export async function listPatientAppointments(patientId, query = {}) {
  const filter = { patient: patientId }
  if (query.from || query.to) {
    filter.scheduledAt = {}
    if (query.from) filter.scheduledAt.$gte = new Date(query.from)
    if (query.to) filter.scheduledAt.$lte = new Date(query.to)
  }
  if (query.upcoming === 'true') {
    filter.scheduledAt = { ...filter.scheduledAt, $gte: new Date() }
    filter.status = { $in: ['requested', 'confirmed'] }
  }
  const items = await Appointment.find(filter)
    .sort({ scheduledAt: 1, _id: 1 })
    .limit(query.limit ?? 50)
    .populate({ path: 'doctor', select: 'user', populate: { path: 'user', select: 'name' } })
    .lean()
  return items
}

export async function getPatientTimeline(patientId) {
  const [readings, notes, appointments, alerts, medications] = await Promise.all([
    HealthRecord.find({ patient: patientId })
      .sort({ recordedAt: -1, _id: -1 }).limit(30).select('type values status recordedAt').lean(),
    Note.find({ patient: patientId, visibility: 'careTeam' })
      .sort({ createdAt: -1, _id: -1 }).limit(30).populate('author', 'name role').lean(),
    Appointment.find({ patient: patientId })
      .sort({ scheduledAt: -1, _id: -1 }).limit(30).select('scheduledAt mode reason status').lean(),
    Alert.find({ patient: patientId })
      .sort({ createdAt: -1, _id: -1 }).limit(30).select('type severity status message createdAt').lean(),
    Medication.find({ patient: patientId })
      .sort({ updatedAt: -1, _id: -1 }).limit(30).select('name dose active updatedAt').lean(),
  ])
  return [
    ...readings.map((item) => ({ id: item._id, type: 'reading', at: item.recordedAt, item })),
    ...notes.map((item) => ({ id: item._id, type: 'note', at: item.createdAt, item })),
    ...appointments.map((item) => ({ id: item._id, type: 'appointment', at: item.scheduledAt, item })),
    ...alerts.map((item) => ({ id: item._id, type: 'alert', at: item.createdAt, item })),
    ...medications.map((item) => ({ id: item._id, type: 'medication', at: item.updatedAt, item })),
  ].sort((left, right) => new Date(right.at) - new Date(left.at)).slice(0, 50)
}
