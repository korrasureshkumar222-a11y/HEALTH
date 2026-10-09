import Alert from '../models/Alert.js'
import AuditLog from '../models/AuditLog.js'
import Doctor from '../models/Doctor.js'
import HealthCentre from '../models/HealthCentre.js'
import Patient from '../models/Patient.js'
import SosIncident from '../models/SosIncident.js'
import Chw from '../models/Chw.js'
import User from '../models/User.js'
import ApiError from '../utils/ApiError.js'
import { createSosAlert } from './alertService.js'
import { createInAppNotification } from './notificationService.js'
import { canAccessPatient } from './permissions.js'
import { sosNotificationTemplate, sosSmsTemplate } from '../utils/messageTemplates.js'

async function nearestCentres(location) {
  const centres = await HealthCentre.aggregate([
    {
      $geoNear: {
        near: location,
        distanceField: 'distanceMeters',
        spherical: true,
        key: 'location',
        query: { isActive: true },
      },
    },
    { $limit: 3 },
    {
      $project: {
        name: 1,
        type: 1,
        address: 1,
        phone: 1,
        hasAmbulance: 1,
        hasDrone: 1,
        is24x7: 1,
        location: 1,
        distanceMeters: 1,
      },
    },
  ])
  return centres.map((centre) => ({
    ...centre,
    distanceKm: Math.round((centre.distanceMeters / 1000) * 10) / 10,
  }))
}

async function emergencySms(patient, location) {
  const coordinates = location.coordinates
  const mapLink = `https://maps.google.com/?q=${coordinates[1]},${coordinates[0]}`
  const name = patient.user?.name ?? patient.name ?? 'Patient'
  const teamUserIds = []
  if (patient.assignedDoctor) {
    const doctor = await Doctor.findById(patient.assignedDoctor).select('user').lean()
    if (doctor?.user) teamUserIds.push(doctor.user)
  }
  if (patient.assignedChw) {
    const chw = await Chw.findById(patient.assignedChw).select('user').lean()
    if (chw?.user) teamUserIds.push(chw.user)
  } else {
    const villageChw = await Chw.findOne({
      assignedVillages: {
        $elemMatch: {
          village: new RegExp(`^${String(patient.village).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          ...(patient.mandal ? { mandal: new RegExp(`^${String(patient.mandal).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } : {}),
          ...(patient.district ? { district: new RegExp(`^${String(patient.district).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } : {}),
        },
      },
    }).select('user').lean()
    if (villageChw?.user) teamUserIds.push(villageChw.user)
  }
  const teamUsers = await User.find({
    _id: { $in: teamUserIds },
    isActive: true,
  }).select('phone').lean()
  const emergencyPhones = (patient.emergencyContacts ?? [])
    .filter((contact) => contact.consentToContact !== false && contact.phone)
    .map((contact) => contact.phone)
  return {
    recipients: [...new Set([...emergencyPhones, ...teamUsers.map((user) => user.phone)])],
    body: sosSmsTemplate({ name, mapLink, language: patient.user?.language }),
    mapLink,
  }
}

async function notifySosTeam(incident, patient) {
  const assignments = []
  const statuses = []
  if (patient.assignedDoctor) {
    const doctor = await Doctor.findById(patient.assignedDoctor).select('user').lean()
    if (doctor?.user && await User.exists({ _id: doctor.user, isActive: true })) {
      assignments.push(doctor.user)
      statuses.push('doctorNotified')
    }
  }
  let chw
  if (patient.assignedChw) {
    chw = await Chw.findById(patient.assignedChw).select('user').lean()
  } else {
    chw = await Chw.findOne({
      assignedVillages: {
        $elemMatch: {
          village: new RegExp(`^${String(patient.village).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          ...(patient.mandal ? { mandal: new RegExp(`^${String(patient.mandal).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } : {}),
          ...(patient.district ? { district: new RegExp(`^${String(patient.district).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } : {}),
        },
      },
    }).select('user').lean()
  }
  if (chw?.user && await User.exists({ _id: chw.user, isActive: true })) {
    assignments.push(chw.user)
    statuses.push('chwNotified')
  }

  for (const recipient of new Set(assignments.map((id) => id.toString()))) {
    await createInAppNotification({
      user: recipient,
      patient: patient._id,
      type: 'sos_update',
      ...sosNotificationTemplate(),
      relatedResource: { kind: 'SosIncident', id: incident._id },
      data: { incidentId: incident._id.toString() },
      dedupeKey: `sos:${incident._id}:user:${recipient}`,
    })
  }
  return statuses
}

async function persistNotificationTimeline(incidentId, statuses) {
  if (!statuses.length) return
  const incident = await SosIncident.findById(incidentId)
  if (!incident) return
  for (const status of statuses) {
    if (incident.timeline.some((entry) => entry.status === status)) continue
    incident.timeline.push({ status, at: new Date() })
    incident.status = status
  }
  await incident.save()
}

export async function createSosIncident(user, input, targetPatientId) {
  let patientQuery
  if (user.role === 'patient') {
    if (targetPatientId && !await canAccessPatient(user, targetPatientId)) {
      throw new ApiError(403, 'Patients can only request SOS for themselves.', 'FORBIDDEN')
    }
    patientQuery = { user: user._id }
  } else if (user.role === 'chw' && targetPatientId) {
    if (!await canAccessPatient(user, targetPatientId)) {
      throw new ApiError(403, 'You can only request SOS for patients in your assigned villages.', 'FORBIDDEN')
    }
    patientQuery = { _id: targetPatientId, status: 'active' }
  } else {
    throw new ApiError(403, 'You are not allowed to trigger an SOS for this patient.', 'FORBIDDEN')
  }

  const patient = await Patient.findOne(patientQuery)
    .populate('user', 'name phone language')
    .select('user name emergencyContacts location assignedDoctor assignedChw village mandal district')
    .lean()
  if (!patient) throw new ApiError(404, 'Patient profile not found.', 'NOT_FOUND')

  if (input.clientId) {
    const existing = await SosIncident.findOne({ clientId: input.clientId }).lean()
    if (existing) {
      if (existing.patient.toString() !== patient._id.toString()) {
        throw new ApiError(409, 'This SOS request ID is already in use.', 'CLIENT_ID_CONFLICT')
      }
      await createSosAlert({ patientId: patient._id, incidentId: existing._id })
      const statuses = await notifySosTeam(existing, patient)
      await persistNotificationTimeline(existing._id, statuses)
      const updatedIncident = await SosIncident.findById(existing._id).lean()
      // Ensure the returned incident is plain JSON (no mongoose/ObjectId wrappers)
      const incidentJson = JSON.parse(JSON.stringify(updatedIncident))
      return {
        incident: incidentJson,
        nearestHealthCentres: await nearestCentres(incidentJson.location),
        emergencySms: await emergencySms(patient, incidentJson.location),
        duplicate: true,
      }
    }
  }

  const location = input.location ?? patient.location
  if (!location) {
    throw new ApiError(400, 'GPS is unavailable and no saved patient location exists.', 'SOS_LOCATION_REQUIRED')
  }

  let incident
  let duplicate = false
  try {
    incident = await SosIncident.create({
      patient: patient._id,
      triggeredBy: user._id,
      clientId: input.clientId,
      location,
      status: 'triggered',
      timeline: [{ status: 'triggered', at: new Date(), actor: user._id }],
    })
  } catch (error) {
    if (error.code !== 11000 || !input.clientId) throw error
    incident = await SosIncident.findOne({ clientId: input.clientId })
    if (!incident || incident.patient.toString() !== patient._id.toString()) {
      throw new ApiError(409, 'This SOS request ID is already in use.', 'CLIENT_ID_CONFLICT')
    }
    duplicate = true
  }

  if (!duplicate) {
    await createSosAlert({ patientId: patient._id, incidentId: incident._id })
    const statuses = await notifySosTeam(incident, patient)
    await persistNotificationTimeline(incident._id, statuses)
  }
  const [centres, savedIncident] = await Promise.all([
    nearestCentres(location),
    SosIncident.findById(incident._id).lean(),
  ])
  // Normalize the incident to a plain JSON object to avoid non-serializable mongoose types
  const incidentJson = JSON.parse(JSON.stringify(savedIncident))
  return {
    incident: incidentJson,
    nearestHealthCentres: centres,
    emergencySms: await emergencySms(patient, location),
    duplicate,
  }
}

export async function createSmsSosIncident(patient) {
  if (!patient.location) {
    throw new ApiError(400, 'The patient has no saved location for an SMS SOS.', 'SOS_LOCATION_REQUIRED')
  }
  const current = await SosIncident.findOne({
    patient: patient._id,
    status: { $ne: 'resolved' },
    createdAt: { $gte: new Date(Date.now() - 30 * 60_000) },
  }).sort({ createdAt: -1 })
  if (current) return { incident: current, duplicate: true }

  const incident = await SosIncident.create({
    patient: patient._id,
    source: 'sms',
    location: patient.location,
    status: 'triggered',
    timeline: [{ status: 'triggered', at: new Date(), note: 'SOS received by SMS.' }],
  })
  await createSosAlert({ patientId: patient._id, incidentId: incident._id })
  const statuses = await notifySosTeam(incident, patient)
  await persistNotificationTimeline(incident._id, statuses)
  return {
    incident: await SosIncident.findById(incident._id),
    duplicate: false,
  }
}


export async function getSosIncident(user, incidentId) {
  const incident = await SosIncident.findById(incidentId)
    .populate({ path: 'patient', select: 'name village user', populate: { path: 'user', select: 'name' } })
    .populate('timeline.actor', 'name role')
    .populate('resolvedBy', 'name role')
    .lean()
  if (!incident) throw new ApiError(404, 'SOS incident not found.', 'NOT_FOUND')
  if (!await canAccessPatient(user, incident.patient._id)) {
    throw new ApiError(403, 'You are not allowed to access this SOS incident.', 'FORBIDDEN')
  }
  return incident
}

const allowedNextStatuses = {
  triggered: ['doctorNotified', 'chwNotified'],
  doctorNotified: ['chwNotified', 'ambulanceRequested', 'droneRequested', 'resolved'],
  chwNotified: ['ambulanceRequested', 'droneRequested', 'resolved'],
  ambulanceRequested: ['droneRequested', 'resolved'],
  droneRequested: ['ambulanceRequested', 'resolved'],
}

export async function updateSosStatus(user, incidentId, { status, note }) {
  const incident = await SosIncident.findById(incidentId)
  if (!incident) throw new ApiError(404, 'SOS incident not found.', 'NOT_FOUND')
  if (!await canAccessPatient(user, incident.patient)) {
    throw new ApiError(403, 'You are not allowed to update this SOS incident.', 'FORBIDDEN')
  }
  if (status === 'resolved' && !['doctor', 'admin'].includes(user.role)) {
    throw new ApiError(403, 'Only a doctor or admin can resolve an SOS incident.', 'FORBIDDEN')
  }
  if (status !== 'resolved' && !['doctor', 'chw', 'admin'].includes(user.role)) {
    throw new ApiError(403, 'Only care-team staff can update an SOS incident.', 'FORBIDDEN')
  }
  if (!allowedNextStatuses[incident.status]?.includes(status)) {
    throw new ApiError(409, 'This SOS status transition is not permitted.', 'INVALID_STATE_TRANSITION')
  }
  const now = new Date()
  incident.status = status
  incident.timeline.push({ status, at: now, actor: user._id, note })
  if (status === 'resolved') {
    incident.resolvedBy = user._id
    incident.resolvedAt = now
  }
  await incident.save()
  if (status === 'resolved') {
    await Alert.updateMany(
      { sosIncident: incident._id, status: { $ne: 'resolved' } },
      {
        $set: {
          status: 'resolved',
          resolvedBy: user._id,
          resolvedAt: now,
          resolutionNote: note,
          'escalation.nextEscalationAt': undefined,
        },
      },
    )
  }
  await AuditLog.create({
    actor: user._id,
    actorRole: user.role,
    action: 'sos.status',
    resourceType: 'SosIncident',
    resourceId: incident._id,
    changedFields: ['status', 'timeline'],
  })
  return incident
}
