import Alert from '../models/Alert.js'
import Appointment from '../models/Appointment.js'
import AuditLog from '../models/AuditLog.js'
import Chw from '../models/Chw.js'
import Doctor from '../models/Doctor.js'
import HealthRecord from '../models/HealthRecord.js'
import Medication from '../models/Medication.js'
import Patient from '../models/Patient.js'
import User from '../models/User.js'
import ApiError from '../utils/ApiError.js'
import { env } from '../config/env.js'
import { canAccessPatient } from './permissions.js'
import { createInAppNotification } from './notificationService.js'
import { sendSms } from './smsService.js'
import {
  alertMessages,
  medicationReminderTemplate,
} from '../utils/messageTemplates.js'
import { smsAppointmentReminder } from '../utils/smsTemplates.js'

function escapedRegex(value) {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
}

async function getAlertScope(user) {
  if (user.role === 'admin') return {}
  if (user.role === 'patient') {
    const patient = await Patient.findOne({ user: user._id }).select('_id').lean()
    return { patient: patient?._id ?? null }
  }
  if (user.role === 'doctor') {
    const doctor = await Doctor.findOne({ user: user._id }).select('_id').lean()
    if (!doctor) return { patient: null }
    const patients = await Patient.find({ assignedDoctor: doctor._id, status: 'active' }).select('_id').lean()
    return { patient: { $in: patients.map(({ _id }) => _id) } }
  }
  if (user.role === 'chw') {
    const chw = await Chw.findOne({ user: user._id }).select('assignedVillages').lean()
    const villageFilters = (chw?.assignedVillages ?? []).map((village) => ({
      village: escapedRegex(village.village),
      ...(village.mandal ? { mandal: escapedRegex(village.mandal) } : {}),
      ...(village.district ? { district: escapedRegex(village.district) } : {}),
    }))
    if (!villageFilters.length) return { patient: null }
    const patients = await Patient.find({
      status: 'active',
      $or: villageFilters,
    }).select('_id').lean()
    return { patient: { $in: patients.map(({ _id }) => _id) } }
  }
  return { patient: null }
}

async function recipientForLevel(patient, level) {
  let userId
  if (level === 0 && patient.assignedDoctor) {
    const doctor = await Doctor.findById(patient.assignedDoctor).select('user').lean()
    userId = doctor?.user
  } else if (level === 1) {
    const chw = patient.assignedChw
      ? await Chw.findById(patient.assignedChw).select('user').lean()
      : await Chw.findOne({
        assignedVillages: {
          $elemMatch: {
            village: escapedRegex(patient.village ?? ''),
            ...(patient.mandal ? { mandal: escapedRegex(patient.mandal) } : {}),
            ...(patient.district ? { district: escapedRegex(patient.district) } : {}),
          },
        },
      }).select('user').lean()
    userId = chw?.user
  } else if (level === 2) {
    const admin = await User.findOne({ role: 'admin', isActive: true }).select('_id').lean()
    userId = admin?._id
  }
  if (!userId) return null
  const active = await User.exists({ _id: userId, isActive: true })
  return active ? userId : null
}

async function firstAvailableLevel(patient) {
  for (let level = 0; level <= 2; level += 1) {
    const userId = await recipientForLevel(patient, level)
    if (userId) return { level, userId }
  }
  return { level: 2, userId: null }
}

async function notifyAlert(alert, patient, level, userId) {
  if (!userId) return
  const content = alertMessages[alert.type] ?? alertMessages.warning_reading
  const notificationType = alert.type === 'sos'
    ? 'sos_update'
    : alert.severity === 'critical'
      ? 'critical_alert'
      : 'warning_alert'
  await createInAppNotification({
    user: userId,
    patient: patient._id,
    type: notificationType,
    title: { en: content.en[0], te: content.te[0] },
    body: { en: alert.message.en, te: alert.message.te },
    relatedResource: { kind: 'Alert', id: alert._id },
    data: { alertId: alert._id.toString() },
    dedupeKey: `alert:${alert._id}:level:${level}:user:${userId}`,
  })
  const recipient = await User.findOne({ _id: userId, isActive: true }).select('phone language').lean()
  if (recipient?.phone) {
    await sendSms({
      to: recipient.phone,
      body: alert.message[recipient.language === 'te' ? 'te' : 'en'],
      bodyRedacted: `${content[recipient.language === 'te' ? 'te' : 'en'][0]} [details redacted]`,
      language: recipient.language,
      messageType: 'alert',
      purpose: 'alert',
      patient: patient._id,
      user: userId,
      dedupeKey: `alert:${alert._id}:sms:user:${userId}`,
    })
  }
}

async function createAlert(input, {
  dedupeWindowMinutes = env.alertDedupeWindowMinutes,
  dedupeKey,
  notify = true,
} = {}) {
  const now = new Date()
  const patient = await Patient.findById(input.patient)
    .select('user assignedDoctor assignedChw village mandal district')
    .lean()
  if (!patient) throw new ApiError(404, 'Patient not found.', 'NOT_FOUND')

  const threshold = dedupeWindowMinutes
    ? new Date(now.getTime() - dedupeWindowMinutes * 60_000)
    : undefined
  const previous = threshold
    ? await Alert.findOne({
      patient: input.patient,
      type: input.type,
      status: { $ne: 'resolved' },
      createdAt: { $gte: threshold },
    }).sort({ createdAt: -1 })
    : null
  if (previous) {
    if (notify && previous.status === 'open') {
      const userId = await recipientForLevel(patient, previous.escalation.level)
      await notifyAlert(previous, patient, previous.escalation.level, userId)
    }
    return previous
  }

  const first = await firstAvailableLevel(patient)
  const escalationMinutes = env.alertEscalationMinutes
  const interval = dedupeWindowMinutes * 60_000
  const bucket = dedupeWindowMinutes ? Math.floor(now.getTime() / interval) : ''
  const baseDedupeKey = dedupeKey ?? `${input.patient}:${input.type}:${bucket}`
  const value = {
    ...input,
    dedupeKey: baseDedupeKey,
    escalation: {
      level: first.level,
      nextEscalationAt: first.level < 2
        ? new Date(now.getTime() + escalationMinutes * 60_000)
        : undefined,
    },
  }

  let alert
  for (let attempt = 0; attempt < 20; attempt += 1) {
    value.dedupeKey = attempt === 0 ? baseDedupeKey : `${baseDedupeKey}:${attempt}`
    try {
      alert = await Alert.create(value)
      break
    } catch (error) {
      if (error.code !== 11000) throw error
      const active = threshold
        ? await Alert.findOne({
          patient: input.patient,
          type: input.type,
          status: { $ne: 'resolved' },
          createdAt: { $gte: threshold },
        }).sort({ createdAt: -1 })
        : await Alert.findOne({ dedupeKey: baseDedupeKey })
      if (active) {
        if (notify && active.status === 'open') {
          const userId = await recipientForLevel(patient, active.escalation.level)
          await notifyAlert(active, patient, active.escalation.level, userId)
        }
        return active
      }
    }
  }
  if (!alert) throw new Error('Unable to allocate a unique deduplication key for the alert.')
  if (notify) await notifyAlert(alert, patient, first.level, first.userId)
  return alert
}

export async function createReadingAlert(record) {
  if (!['warning', 'critical'].includes(record.status)) return null
  const type = `${record.status}_reading`
  const text = alertMessages[type]
  return createAlert({
    patient: record.patient,
    record: record._id,
    type,
    severity: record.status,
    message: { en: text.en[1], te: text.te[1] },
  })
}

export async function listAlerts(user, filters) {
  const scope = await getAlertScope(user)
  if (filters.patientId && !await canAccessPatient(user, filters.patientId)) {
    throw new ApiError(403, 'You are not allowed to access this patient.', 'FORBIDDEN')
  }
  const query = { ...scope }
  if (filters.patientId) query.patient = filters.patientId
  for (const field of ['status', 'severity', 'type']) {
    if (filters[field]) query[field] = filters[field]
  }
  if (filters.from || filters.to) {
    query.createdAt = {}
    if (filters.from) query.createdAt.$gte = new Date(filters.from)
    if (filters.to) query.createdAt.$lte = new Date(filters.to)
  }
  const skip = (filters.page - 1) * filters.limit
  const [items, total] = await Promise.all([
    Alert.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(filters.limit)
      .populate({ path: 'patient', select: 'name village user', populate: { path: 'user', select: 'name' } })
      .populate('acknowledgedBy', 'name role')
      .lean(),
    Alert.countDocuments(query),
  ])
  return { items, page: filters.page, limit: filters.limit, total, hasMore: skip + items.length < total }
}

export async function getAlert(user, alertId) {
  const alert = await Alert.findById(alertId)
    .populate({ path: 'patient', select: 'name village user', populate: { path: 'user', select: 'name' } })
    .lean()
  if (!alert) throw new ApiError(404, 'Alert not found.', 'NOT_FOUND')
  if (!await canAccessPatient(user, alert.patient._id)) {
    throw new ApiError(403, 'You are not allowed to access this alert.', 'FORBIDDEN')
  }
  return alert
}

async function getMutableAlert(user, alertId) {
  if (!['doctor', 'chw', 'admin'].includes(user.role)) {
    throw new ApiError(403, 'Only care-team staff can update alerts.', 'FORBIDDEN')
  }
  const alert = await Alert.findById(alertId)
  if (!alert) throw new ApiError(404, 'Alert not found.', 'NOT_FOUND')
  if (!await canAccessPatient(user, alert.patient)) {
    throw new ApiError(403, 'You are not allowed to update this alert.', 'FORBIDDEN')
  }
  return alert
}

export async function acknowledgeAlert(user, alertId, note) {
  const alert = await getMutableAlert(user, alertId)
  if (alert.status !== 'open') {
    throw new ApiError(409, 'Only open alerts can be acknowledged.', 'INVALID_STATE_TRANSITION')
  }
  alert.status = 'acknowledged'
  alert.acknowledgedBy = user._id
  alert.acknowledgedAt = new Date()
  alert.acknowledgmentNote = note
  alert.escalation.nextEscalationAt = undefined
  await alert.save()
  await AuditLog.create({
    actor: user._id,
    actorRole: user.role,
    action: 'alert.acknowledge',
    resourceType: 'Alert',
    resourceId: alert._id,
    changedFields: ['status', 'acknowledgedBy', 'acknowledgedAt'],
  })
  return alert
}

export async function resolveAlert(user, alertId, resolutionNote) {
  if (!['doctor', 'admin'].includes(user.role)) {
    throw new ApiError(403, 'Only a doctor or admin can resolve an alert.', 'FORBIDDEN')
  }
  const alert = await getMutableAlert(user, alertId)
  if (alert.status === 'resolved') {
    throw new ApiError(409, 'This alert is already resolved.', 'INVALID_STATE_TRANSITION')
  }
  alert.status = 'resolved'
  alert.resolvedBy = user._id
  alert.resolvedAt = new Date()
  alert.resolutionNote = resolutionNote
  alert.escalation.nextEscalationAt = undefined
  await alert.save()
  await AuditLog.create({
    actor: user._id,
    actorRole: user.role,
    action: 'alert.resolve',
    resourceType: 'Alert',
    resourceId: alert._id,
    changedFields: ['status', 'resolvedBy', 'resolvedAt'],
  })
  return alert
}

export async function createMissedReadingAlerts(now = new Date()) {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60_000)
  const recentPatientIds = await HealthRecord.distinct('patient', {
    recordedAt: { $gte: cutoff, $lte: now },
  })
  const patients = await Patient.find({
    status: 'active',
    _id: { $nin: recentPatientIds },
  }).select('_id').lean()
  let created = 0
  for (const patient of patients) {
    const alert = await createAlert({
      patient: patient._id,
      type: 'missed_reading',
      severity: 'warning',
      message: { en: alertMessages.missed_reading.en[1], te: alertMessages.missed_reading.te[1] },
    }, { dedupeWindowMinutes: 24 * 60 })
    if (alert.createdAt >= new Date(now.getTime() - 1000)) created += 1
  }
  return { checked: patients.length, created }
}

export async function sendMedicationReminders(now = new Date()) {
  const localParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const getPart = (type) => localParts.find((part) => part.type === type)?.value
  const dateKey = `${getPart('year')}-${getPart('month')}-${getPart('day')}`
  const timeKey = `${getPart('hour')}:${getPart('minute')}`
  const localDate = new Date(`${dateKey}T00:00:00+05:30`)
  const medications = await Medication.find({
    active: true,
    startDate: { $lte: now },
    $and: [
      { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
      { timings: timeKey },
    ],
  }).select('patient name dose').lean()
  let notified = 0
  for (const medication of medications) {
    const patient = await Patient.findById(medication.patient).select('user').lean()
    if (!patient?.user) continue
    const reminder = medicationReminderTemplate(medication.name, medication.dose)
    const result = await createInAppNotification({
      user: patient.user,
      patient: medication.patient,
      type: 'medication_reminder',
      title: reminder.title,
      body: reminder.body,
      relatedResource: { kind: 'Medication', id: medication._id },
      data: { medicationId: medication._id.toString(), localDate: dateKey, localTime: timeKey },
      dedupeKey: `medication:${medication._id}:${dateKey}:${timeKey}`,
    })
    if (result.created) notified += 1
  }
  return { checked: medications.length, notified, localDate, time: timeKey }
}

export async function sendAppointmentReminders(now = new Date()) {
  const reminderWindows = [60, 24 * 60].map((minutes) => ({
    minutes,
    start: new Date(now.getTime() + minutes * 60_000 - 30_000),
    end: new Date(now.getTime() + minutes * 60_000 + 30_000),
  }))
  const appointments = await Appointment.find({
    status: 'confirmed',
    $or: reminderWindows.map(({ start, end }) => ({
      scheduledAt: { $gte: start, $lt: end },
    })),
  })
    .populate({
      path: 'patient',
      select: 'phone language user',
      populate: { path: 'user', select: 'phone language name' },
    })
    .populate({ path: 'doctor', select: 'user', populate: { path: 'user', select: 'name' } })
    .lean()
  let sent = 0
  for (const appointment of appointments) {
    const patient = appointment.patient
    const recipient = patient?.user?.phone ?? patient?.phone
    if (!recipient) continue
    const window = reminderWindows.find(({ start, end }) => (
      appointment.scheduledAt >= start && appointment.scheduledAt < end
    ))
    if (!window) continue
    const language = patient.user?.language ?? patient.language ?? 'en'
    const reminderText = {
      en: smsAppointmentReminder({
        scheduledAt: appointment.scheduledAt,
        doctorName: appointment.doctor?.user?.name,
        language: 'en',
      }),
      te: smsAppointmentReminder({
        scheduledAt: appointment.scheduledAt,
        doctorName: appointment.doctor?.user?.name,
        language: 'te',
      }),
    }
    if (patient.user?._id) {
      await createInAppNotification({
        user: patient.user._id,
        patient: patient._id,
        type: 'appointment_reminder',
        title: {
          en: 'Upcoming appointment',
          te: 'రాబోయే అపాయింట్‌మెంట్',
        },
        body: reminderText,
        relatedResource: { kind: 'Appointment', id: appointment._id },
        dedupeKey: `appointment:${appointment._id}:reminder:${window.minutes}:in-app`,
      })
    }
    const result = await sendSms({
      to: recipient,
      body: reminderText[language === 'te' ? 'te' : 'en'],
      language,
      messageType: 'appointment_reminder',
      purpose: 'appointment_reminder',
      patient: patient._id,
      user: patient.user?._id,
      appointment: appointment._id,
      dedupeKey: `appointment:${appointment._id}:reminder:${window.minutes}`,
    })
    if (result.status === 'sent' || result.status === 'simulated' || result.duplicate) sent += 1
  }
  return { checked: appointments.length, sent }
}

export async function escalateDueAlerts(now = new Date()) {
  const dueAlerts = await Alert.find({
    status: 'open',
    'escalation.level': { $lt: 2 },
    'escalation.nextEscalationAt': { $lte: now },
  }).limit(500).lean()
  let escalated = 0
  for (const due of dueAlerts) {
    const nextLevel = due.escalation.level + 1
    const nextAt = nextLevel < 2
      ? new Date(now.getTime() + env.alertEscalationMinutes * 60_000)
      : undefined
    const claimed = await Alert.findOneAndUpdate(
      {
        _id: due._id,
        status: 'open',
        'escalation.level': due.escalation.level,
        'escalation.nextEscalationAt': { $lte: now },
      },
      {
        $set: {
          'escalation.level': nextLevel,
          'escalation.lastEscalatedAt': now,
          'escalation.nextEscalationAt': nextAt,
        },
      },
      { new: true },
    )
    if (!claimed) continue
    const patient = await Patient.findById(claimed.patient)
      .select('user assignedDoctor assignedChw village mandal district')
      .lean()
    const recipient = patient ? await recipientForLevel(patient, nextLevel) : null
    await notifyAlert(claimed, patient ?? { _id: claimed.patient }, nextLevel, recipient)
    escalated += 1
  }
  return { checked: dueAlerts.length, escalated }
}

export async function createSosAlert({ patientId, incidentId }) {
  const text = alertMessages.sos
  return createAlert({
    patient: patientId,
    sosIncident: incidentId,
    type: 'sos',
    severity: 'critical',
    message: { en: text.en[1], te: text.te[1] },
  }, { dedupeWindowMinutes: 0, dedupeKey: `sos:${incidentId}`, notify: false })
}
