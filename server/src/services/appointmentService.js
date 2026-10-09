import mongoose from 'mongoose'
import Appointment from '../models/Appointment.js'
import Chw from '../models/Chw.js'
import Doctor from '../models/Doctor.js'
import HealthCentre from '../models/HealthCentre.js'
import Patient from '../models/Patient.js'
import ApiError from '../utils/ApiError.js'
import { canAccessPatient } from './permissions.js'
import { createInAppNotification } from './notificationService.js'

const SLOT_MINUTES = 30
const SLOT_MS = SLOT_MINUTES * 60_000

function idString(value) {
  return value?._id?.toString() ?? value?.toString()
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getLocalTime(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    dayOfWeek: days[values.weekday],
    minuteOfDay: Number(values.hour) * 60 + Number(values.minute),
    second: Number(values.second),
  }
}

function slotKeys(scheduledAt, durationMinutes) {
  return Array.from({ length: durationMinutes / SLOT_MINUTES }, (_unused, index) => (
    new Date(scheduledAt.getTime() + index * SLOT_MS).toISOString()
  ))
}

function isWithinAvailability(scheduledAt, durationMinutes, availability) {
  return availability.some((entry) => {
    const { dayOfWeek, minuteOfDay, second } = getLocalTime(scheduledAt, entry.timezone)
    if (minuteOfDay % SLOT_MINUTES !== 0 || second !== 0) return false
    const startMinute = Number(entry.startTime.slice(0, 2)) * 60 + Number(entry.startTime.slice(3))
    const endMinute = Number(entry.endTime.slice(0, 2)) * 60 + Number(entry.endTime.slice(3))
    return dayOfWeek === entry.dayOfWeek
      && minuteOfDay >= startMinute
      && minuteOfDay + durationMinutes <= endMinute
      && (minuteOfDay - startMinute) % SLOT_MINUTES === 0
  })
}

async function getDoctorForUser(user) {
  const doctor = await Doctor.findOne({ user: user._id }).select('_id user availability').lean()
  if (!doctor) throw new ApiError(404, 'Doctor profile not found.', 'DOCTOR_PROFILE_NOT_FOUND')
  return doctor
}

async function notifyAppointment(appointment, event) {
  const [patient, doctor] = await Promise.all([
    Patient.findById(appointment.patient).select('user').populate('user', 'language isActive').lean(),
    Doctor.findById(appointment.doctor).select('user').populate('user', 'language isActive').lean(),
  ])
  const people = [patient?.user, doctor?.user]
    .filter((person) => person?.isActive)
  const messages = {
    requested: {
      title: { en: 'Appointment requested', te: 'అపాయింట్‌మెంట్ అభ్యర్థించబడింది' },
      body: { en: 'A patient requested an appointment. Review the schedule.', te: 'రోగి అపాయింట్‌మెంట్ కోరారు. షెడ్యూల్‌ను పరిశీలించండి.' },
    },
    confirmed: {
      title: { en: 'Appointment confirmed', te: 'అపాయింట్‌మెంట్ నిర్ధారించబడింది' },
      body: { en: 'Your appointment has been confirmed.', te: 'మీ అపాయింట్‌మెంట్ నిర్ధారించబడింది.' },
    },
    rescheduled: {
      title: { en: 'Appointment rescheduled', te: 'అపాయింట్‌మెంట్ సమయం మార్చబడింది' },
      body: { en: 'An appointment time has changed. Review the updated schedule.', te: 'అపాయింట్‌మెంట్ సమయం మార్చబడింది. కొత్త షెడ్యూల్‌ను చూడండి.' },
    },
    cancelled: {
      title: { en: 'Appointment cancelled', te: 'అపాయింట్‌మెంట్ రద్దు చేయబడింది' },
      body: { en: 'An appointment has been cancelled.', te: 'అపాయింట్‌మెంట్ రద్దు చేయబడింది.' },
    },
    completed: {
      title: { en: 'Appointment completed', te: 'అపాయింట్‌మెంట్ పూర్తయింది' },
      body: { en: 'The appointment was marked complete.', te: 'అపాయింట్‌మెంట్ పూర్తయినట్లు నమోదు చేశారు.' },
    },
    'no-show': {
      title: { en: 'Appointment marked no-show', te: 'అపాయింట్‌మెంట్‌కు హాజరు కాలేదు' },
      body: { en: 'The appointment was marked as missed.', te: 'అపాయింట్‌మెంట్‌కు హాజరు కాలేదని నమోదు చేశారు.' },
    },
  }
  const content = messages[event]
  const recipients = new Map(people.map((person) => [idString(person._id), person]))
  await Promise.all([...recipients].map(([userId, person]) => createInAppNotification({
    user: userId,
    patient: appointment.patient,
    type: 'appointment_reminder',
    title: content.title,
    body: content.body,
    relatedResource: { kind: 'Appointment', id: appointment._id },
    dedupeKey: `appointment:${appointment._id}:${event}:${appointment.updatedAt?.getTime() ?? Date.now()}:${userId}`,
  })))
}

async function getPatientForBooking(user, patientId) {
  let patient
  if (user.role === 'patient') {
    patient = await Patient.findOne({ user: user._id, status: 'active' }).lean()
    if (patientId && idString(patient?._id) !== patientId) {
      throw new ApiError(403, 'Patients can only book for themselves.', 'FORBIDDEN')
    }
  } else {
    if (!patientId) throw new ApiError(400, 'A patient is required for this booking.', 'PATIENT_REQUIRED')
    if (!await canAccessPatient(user, patientId)) {
      throw new ApiError(403, 'You cannot book for this patient.', 'FORBIDDEN')
    }
    patient = await Patient.findOne({ _id: patientId, status: 'active' }).lean()
  }
  if (!patient) throw new ApiError(404, 'Patient profile not found.', 'NOT_FOUND')
  return patient
}

async function assertDoctorAvailable(doctorId, scheduledAt, durationMinutes) {
  const doctor = await Doctor.findById(doctorId).select('availability').lean()
  if (!doctor) throw new ApiError(404, 'Doctor profile not found.', 'DOCTOR_PROFILE_NOT_FOUND')
  if (!isWithinAvailability(scheduledAt, durationMinutes, doctor.availability ?? [])) {
    throw new ApiError(409, 'This time is outside the doctor’s available slots.', 'APPOINTMENT_SLOT_UNAVAILABLE')
  }
}

export async function createAppointment(user, input) {
  const patient = await getPatientForBooking(user, input.patientId)
  const doctorId = user.role === 'doctor'
    ? idString((await getDoctorForUser(user))._id)
    : input.doctorId
  if (!doctorId) throw new ApiError(400, 'A doctor is required for this booking.', 'DOCTOR_REQUIRED')
  const doctor = await Doctor.findById(doctorId).populate('user', 'isActive isVerified')
  if (!doctor || (user.role !== 'doctor' && (!doctor.isVerified || !doctor.user?.isActive))) {
    throw new ApiError(404, 'Available doctor not found.', 'DOCTOR_NOT_FOUND')
  }
  if (user.role === 'doctor' && !await canAccessPatient(user, patient._id)) {
    throw new ApiError(403, 'You can only schedule appointments for assigned patients.', 'FORBIDDEN')
  }
  if (user.role === 'chw' && idString(patient.assignedDoctor) !== idString(doctor._id)) {
    throw new ApiError(403, 'You can only book with the patient’s assigned doctor.', 'FORBIDDEN')
  }

  const durationMinutes = input.durationMinutes ?? SLOT_MINUTES
  const scheduledAt = new Date(input.scheduledAt)
  await assertDoctorAvailable(doctor._id, scheduledAt, durationMinutes)
  const reservationKeys = slotKeys(scheduledAt, durationMinutes)
  if (await Appointment.exists({
    doctor: doctor._id,
    isActiveReservation: true,
    reservedSlotKeys: { $in: reservationKeys },
  })) {
    throw new ApiError(409, 'This appointment slot is already reserved.', 'APPOINTMENT_CONFLICT')
  }
  if (input.healthCentreId && !await HealthCentre.exists({ _id: input.healthCentreId, isActive: true })) {
    throw new ApiError(404, 'Health centre not found.', 'HEALTH_CENTRE_NOT_FOUND')
  }

  const status = user.role === 'doctor' || user.role === 'admin' ? 'confirmed' : 'requested'
  try {
    const appointment = await Appointment.create({
      patient: patient._id,
      doctor: doctor._id,
      scheduledAt,
      durationMinutes,
      mode: input.mode,
      healthCentre: input.healthCentreId,
      reason: input.reason,
      status,
      createdBy: user._id,
      reservedSlotKeys: reservationKeys,
      isActiveReservation: true,
      statusHistory: [{ status, changedBy: user._id, changedAt: new Date() }],
    })
    await notifyAppointment(appointment, status)
    return appointment
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, 'This appointment slot was just reserved by someone else.', 'APPOINTMENT_CONFLICT')
    }
    throw error
  }
}

export async function listAppointments(user, query) {
  const filter = {}
  if (user.role === 'patient') {
    const patient = await Patient.findOne({ user: user._id }).select('_id').lean()
    filter.patient = patient?._id ?? null
  } else if (user.role === 'doctor') {
    filter.doctor = (await getDoctorForUser(user))._id
  } else if (user.role === 'chw') {
    const chw = await Chw.findOne({ user: user._id }).select('assignedVillages').lean()
    const villages = (chw?.assignedVillages ?? []).map(({ village, mandal, district }) => ({
      village: new RegExp(`^${escapeRegex(village)}$`, 'i'),
      ...(mandal ? { mandal: new RegExp(`^${escapeRegex(mandal)}$`, 'i') } : {}),
      ...(district ? { district: new RegExp(`^${escapeRegex(district)}$`, 'i') } : {}),
    }))
    const patients = villages.length
      ? await Patient.find({ status: 'active', $or: villages }).select('_id').lean()
      : []
    filter.patient = { $in: patients.map(({ _id }) => _id) }
  }
  if (query.patientId) {
    if (user.role === 'patient' && !await canAccessPatient(user, query.patientId)) {
      throw new ApiError(403, 'You cannot access this patient’s appointments.', 'FORBIDDEN')
    }
    if (user.role === 'doctor' && !await canAccessPatient(user, query.patientId)) {
      throw new ApiError(403, 'You cannot access this patient’s appointments.', 'FORBIDDEN')
    }
    if (user.role === 'chw' && !await canAccessPatient(user, query.patientId)) {
      throw new ApiError(403, 'You cannot access this patient’s appointments.', 'FORBIDDEN')
    }
    filter.patient = query.patientId
  }
  if (query.doctorId) {
    if (user.role === 'doctor' && idString((await getDoctorForUser(user))._id) !== query.doctorId) {
      throw new ApiError(403, 'You can only access your own schedule.', 'FORBIDDEN')
    }
    filter.doctor = query.doctorId
  }
  if (query.status) filter.status = query.status
  if (query.upcoming === 'true') {
    filter.scheduledAt = { ...filter.scheduledAt, $gte: new Date() }
    filter.status = { $in: ['requested', 'confirmed'] }
  }
  if (query.from || query.to) {
    filter.scheduledAt = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    }
  }
  const skip = (query.page - 1) * query.limit
  const [items, total] = await Promise.all([
    Appointment.find(filter)
      .sort({ scheduledAt: 1, _id: 1 })
      .skip(skip)
      .limit(query.limit)
      .populate({ path: 'patient', select: 'name phone village user', populate: { path: 'user', select: 'name' } })
      .populate({ path: 'doctor', select: 'user specialization', populate: { path: 'user', select: 'name' } })
      .populate('healthCentre', 'name address')
      .lean(),
    Appointment.countDocuments(filter),
  ])
  return { items, page: query.page, limit: query.limit, total, hasMore: skip + items.length < total }
}

export async function listAvailableDoctors() {
  const doctors = await Doctor.find({ isVerified: true })
    .select('user specialization hospital availability')
    .populate({ path: 'user', match: { isActive: true }, select: 'name' })
    .lean()
  return doctors.filter((doctor) => doctor.user)
    .map(({ _id, user, specialization, hospital }) => ({ _id, name: user.name, specialization, hospital }))
}

export async function getAvailableSlots(doctorId, from, to) {
  if (!mongoose.isValidObjectId(doctorId)) {
    throw new ApiError(400, 'Doctor ID is invalid.', 'INVALID_DOCTOR_ID')
  }
  const doctor = await Doctor.findOne({ _id: doctorId, isVerified: true })
    .select('availability user')
    .populate({ path: 'user', match: { isActive: true }, select: '_id' })
    .lean()
  if (!doctor?.user) throw new ApiError(404, 'Available doctor not found.', 'DOCTOR_NOT_FOUND')
  const start = new Date(from)
  const end = new Date(to)
  const firstSlot = Math.ceil(start.getTime() / (SLOT_MS / 2)) * (SLOT_MS / 2)
  const candidateTimes = []
  for (let time = firstSlot; time < end.getTime(); time += SLOT_MS / 2) {
    const scheduledAt = new Date(time)
    if (isWithinAvailability(scheduledAt, SLOT_MINUTES, doctor.availability ?? [])) {
      candidateTimes.push(scheduledAt)
    }
  }
  if (!candidateTimes.length) return { doctorId, slots: [] }
  const keys = candidateTimes.map((date) => date.toISOString())
  const reservations = await Appointment.find({
    doctor: doctorId,
    isActiveReservation: true,
    reservedSlotKeys: { $in: keys },
  }).select('reservedSlotKeys').lean()
  const reserved = new Set(reservations.flatMap(({ reservedSlotKeys }) => reservedSlotKeys))
  return {
    doctorId,
    slots: candidateTimes
      .filter((date) => !reserved.has(date.toISOString()))
      .map((scheduledAt) => ({ scheduledAt, durationMinutes: SLOT_MINUTES })),
  }
}

export async function updateDoctorAvailability(user, availability) {
  const doctor = await getDoctorForUser(user)
  await Doctor.updateOne({ _id: doctor._id }, { $set: { availability } }, { runValidators: true })
  return availability
}

export async function getDoctorAvailability(user) {
  const doctor = await getDoctorForUser(user)
  return { doctorId: doctor._id, availability: doctor.availability ?? [] }
}

async function loadScopedAppointment(user, appointmentId) {
  const appointment = await Appointment.findById(appointmentId)
  if (!appointment) throw new ApiError(404, 'Appointment not found.', 'NOT_FOUND')
  if (user.role === 'admin') return appointment
  if (user.role === 'doctor') {
    const doctor = await getDoctorForUser(user)
    if (idString(appointment.doctor) !== idString(doctor._id)) {
      throw new ApiError(403, 'You can only manage your own appointments.', 'FORBIDDEN')
    }
    return appointment
  }
  if (!await canAccessPatient(user, appointment.patient)) {
    throw new ApiError(403, 'You cannot manage this appointment.', 'FORBIDDEN')
  }
  return appointment
}

export async function updateAppointmentStatus(user, appointmentId, status, notes) {
  const appointment = await loadScopedAppointment(user, appointmentId)
  if (!['doctor', 'admin'].includes(user.role)) {
    throw new ApiError(403, 'Only a doctor or admin can update appointment status.', 'FORBIDDEN')
  }
  if (status === 'confirmed' && appointment.status !== 'requested') {
    throw new ApiError(409, 'Only requested appointments can be confirmed.', 'INVALID_APPOINTMENT_TRANSITION')
  }
  if (!['requested', 'confirmed'].includes(appointment.status)) {
    throw new ApiError(409, 'This appointment is already closed.', 'INVALID_APPOINTMENT_TRANSITION')
  }
  appointment.status = status
  appointment.isActiveReservation = ['requested', 'confirmed'].includes(status)
  if (notes !== undefined) appointment.notes = notes
  appointment.statusHistory.push({ status, changedBy: user._id, changedAt: new Date(), note: notes })
  await appointment.save()
  await notifyAppointment(appointment, status)
  return appointment
}

export async function rescheduleAppointment(user, appointmentId, input) {
  const appointment = await loadScopedAppointment(user, appointmentId)
  if (!['requested', 'confirmed'].includes(appointment.status)) {
    throw new ApiError(409, 'Only open appointments can be rescheduled.', 'INVALID_APPOINTMENT_TRANSITION')
  }
  const durationMinutes = input.durationMinutes ?? appointment.durationMinutes
  const scheduledAt = new Date(input.scheduledAt)
  await assertDoctorAvailable(appointment.doctor, scheduledAt, durationMinutes)
  const reservationKeys = slotKeys(scheduledAt, durationMinutes)
  if (await Appointment.exists({
    _id: { $ne: appointment._id },
    doctor: appointment.doctor,
    isActiveReservation: true,
    reservedSlotKeys: { $in: reservationKeys },
  })) {
    throw new ApiError(409, 'This appointment slot is already reserved.', 'APPOINTMENT_CONFLICT')
  }
  appointment.scheduledAt = scheduledAt
  appointment.durationMinutes = durationMinutes
  appointment.reservedSlotKeys = reservationKeys
  if (!['doctor', 'admin'].includes(user.role)) appointment.status = 'requested'
  appointment.statusHistory.push({
    status: appointment.status,
    changedBy: user._id,
    changedAt: new Date(),
    note: 'Appointment rescheduled',
  })
  try {
    await appointment.save()
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, 'This appointment slot was just reserved by someone else.', 'APPOINTMENT_CONFLICT')
    }
    throw error
  }
  await notifyAppointment(appointment, 'rescheduled')
  return appointment
}

export async function cancelAppointment(user, appointmentId, reason) {
  const appointment = await loadScopedAppointment(user, appointmentId)
  if (!['requested', 'confirmed'].includes(appointment.status)) {
    throw new ApiError(409, 'This appointment is already closed.', 'INVALID_APPOINTMENT_TRANSITION')
  }
  appointment.status = 'cancelled'
  appointment.isActiveReservation = false
  if (reason) appointment.notes = [appointment.notes, reason].filter(Boolean).join('\n')
  appointment.statusHistory.push({
    status: 'cancelled',
    changedBy: user._id,
    changedAt: new Date(),
    note: reason,
  })
  await appointment.save()
  await notifyAppointment(appointment, 'cancelled')
  return appointment
}
