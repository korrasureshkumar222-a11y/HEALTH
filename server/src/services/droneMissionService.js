import mongoose from 'mongoose'
import { env } from '../config/env.js'
import AuditLog from '../models/AuditLog.js'
import DroneMission from '../models/DroneMission.js'
import HealthCentre from '../models/HealthCentre.js'
import LandingPoint from '../models/LandingPoint.js'
import Patient from '../models/Patient.js'
import SosIncident from '../models/SosIncident.js'
import User from '../models/User.js'
import Doctor from '../models/Doctor.js'
import ApiError from '../utils/ApiError.js'
import { createInAppNotification } from './notificationService.js'
import { canAccessPatient } from './permissions.js'
import {
  createDroneProvider,
  createWeatherProvider,
} from './droneProviders.js'
import { createSmsProvider } from './smsProviders.js'
import { sendSms } from './smsService.js'
import { smsDroneArrival } from '../utils/smsTemplates.js'

let droneProvider = createDroneProvider()
let weatherProvider = createWeatherProvider()
let smsProvider = createSmsProvider()

export function configureDroneAdapters(adapters) {
  if (adapters.drone) droneProvider = adapters.drone
  if (adapters.weather) weatherProvider = adapters.weather
  if (adapters.sms) smsProvider = adapters.sms
}

function distanceKm(first, second) {
  const radians = (degrees) => degrees * Math.PI / 180
  const [firstLng, firstLat] = first.coordinates
  const [secondLng, secondLat] = second.coordinates
  const latDiff = radians(secondLat - firstLat)
  const lngDiff = radians(secondLng - firstLng)
  const a = Math.sin(latDiff / 2) ** 2
    + Math.cos(radians(firstLat)) * Math.cos(radians(secondLat)) * Math.sin(lngDiff / 2) ** 2
  const boundedA = Math.min(1, Math.max(0, a))
  return 6371 * 2 * Math.atan2(Math.sqrt(boundedA), Math.sqrt(1 - boundedA))
}

async function nearestDroneOrigin(location) {
  const centres = await HealthCentre.aggregate([
    {
      $geoNear: {
        near: location,
        distanceField: 'distanceMeters',
        spherical: true,
        key: 'location',
        query: { isActive: true, hasDrone: true },
      },
    },
    { $limit: 1 },
  ])
  if (!centres.length) {
    throw new ApiError(409, 'No active drone-capable health centre is available.', 'DRONE_ORIGIN_UNAVAILABLE')
  }
  return centres[0]
}

async function nearestLandingPoint(location) {
  const points = await LandingPoint.aggregate([
    {
      $geoNear: {
        near: location,
        distanceField: 'distanceMeters',
        spherical: true,
        key: 'location',
        query: {
          isActive: true,
          noFly: false,
          verifiedAt: { $ne: null },
          reverifyAt: { $gt: new Date() },
        },
      },
    },
    { $limit: 1 },
  ])
  if (!points.length) {
    throw new ApiError(409, 'No verified, active landing point is available.', 'LANDING_POINT_UNAVAILABLE')
  }
  return points[0]
}

async function recordAudit(user, action, missionId, changedFields) {
  await AuditLog.create({
    actor: user._id,
    actorRole: user.role,
    action,
    resourceType: 'DroneMission',
    resourceId: missionId,
    changedFields,
  })
}

async function appendIncidentDroneStatus(incidentId, actor, status, note) {
  if (!incidentId) return
  const incident = await SosIncident.findById(incidentId)
  if (!incident || incident.status === 'resolved') return
  if (incident.status !== 'droneRequested') {
    incident.status = 'droneRequested'
    incident.timeline.push({ status: 'droneRequested', at: new Date(), actor, note })
    await incident.save()
  }
}

async function notifyLandingContact(mission, landingPoint) {
  const etaMinutes = Math.max(1, Math.ceil((mission.eta.getTime() - Date.now()) / 60_000))
  const body = smsDroneArrival({
    point: landingPoint.name,
    etaMinutes,
    language: landingPoint.contactLanguage ?? 'en',
  })
  const result = await sendSms({
    to: landingPoint.phone,
    body,
    language: landingPoint.contactLanguage ?? 'en',
    bodyRedacted: `Drone arrival at ${landingPoint.name} in ${etaMinutes} min`,
    messageType: 'drone_update',
    purpose: 'drone_arrival',
    patient: mission.patient,
    droneMission: mission._id,
    dedupeKey: `drone-arrival:${mission._id}`,
    smsProvider,
  })
  return { ...result, simulated: result.status === 'simulated' }
}

async function notifyCareTeam(mission, patient) {
  const recipients = []
  if (patient.assignedDoctor) {
    const doctor = await Doctor.findById(patient.assignedDoctor).select('user').lean()
    if (doctor?.user) recipients.push(doctor.user)
  }
  const users = await User.find({ _id: { $in: recipients }, isActive: true }).select('_id language').lean()
  const landing = await LandingPoint.findById(mission.landingPoint).select('name').lean()
  await Promise.all(users.map((user) => createInAppNotification({
    user: user._id,
    patient: patient._id,
    type: 'drone_update',
    title: { en: 'Drone mission dispatched', te: 'డ్రోన్ మిషన్ పంపబడింది' },
    body: {
      en: `Supplies are being sent to ${landing.name}.`,
      te: `${landing.name}కు వైద్య సామగ్రి పంపబడుతోంది.`,
    },
    channel: 'inApp',
    status: 'delivered',
    relatedResource: { kind: 'DroneMission', id: mission._id },
    data: { missionId: mission._id.toString() },
    dedupeKey: `drone:${mission._id}:user:${user._id}`,
  })))
}

async function findPatientAndLocation(user, input) {
  let patient
  let incident
  if (input.sosIncident) {
    incident = await SosIncident.findById(input.sosIncident).lean()
    if (!incident) throw new ApiError(404, 'SOS incident not found.', 'NOT_FOUND')
    if (input.patientId && input.patientId !== incident.patient.toString()) {
      throw new ApiError(400, 'Patient does not match the SOS incident.', 'SOS_PATIENT_MISMATCH')
    }
    if (!await canAccessPatient(user, incident.patient)) {
      throw new ApiError(403, 'You are not allowed to request a mission for this patient.', 'FORBIDDEN')
    }
    patient = await Patient.findById(incident.patient).lean()
    return { patient, incident, location: incident.location }
  }
  if (user.role !== 'doctor' && user.role !== 'admin') {
    throw new ApiError(403, 'Only a doctor or admin can request a mission without an SOS incident.', 'FORBIDDEN')
  }
  if (!await canAccessPatient(user, input.patientId)) {
    throw new ApiError(403, 'You are not allowed to request a mission for this patient.', 'FORBIDDEN')
  }
  patient = await Patient.findOne({ _id: input.patientId, status: 'active' }).lean()
  if (!patient) throw new ApiError(404, 'Patient not found.', 'NOT_FOUND')
  if (!patient.location) throw new ApiError(409, 'Patient location is not available.', 'PATIENT_LOCATION_UNAVAILABLE')
  return { patient, incident: null, location: patient.location }
}

async function checkWeather(route) {
  const result = await weatherProvider.checkFlightConditions(route)
  if (env.droneProvider === 'http' && (
    typeof result?.provider !== 'string'
    || !result.provider.trim()
    || result.provider === 'mock-weather'
  )) {
    throw new ApiError(503, 'A live weather provider is required before using the HTTP drone provider.', 'DRONE_WEATHER_PROVIDER_NOT_CONFIGURED')
  }
  if (!result?.safe) {
    throw new ApiError(409, result?.reason ?? 'Weather conditions are unsafe for dispatch.', 'DRONE_WEATHER_UNSAFE')
  }
  return result
}

function missionViewQuery(query) {
  return query
    .populate('patient', 'name village user')
    .populate('originHealthCentre', 'name type address phone location')
    .populate('landingPoint', 'village name location contactPerson phone noFly')
    .populate('requestedBy', 'name role')
    .populate('approvedBy', 'name role')
    .populate('timeline.actor', 'name role')
}

export async function requestDroneMission(user, input) {
  if (!['patient', 'doctor', 'chw', 'admin'].includes(user.role)) {
    throw new ApiError(403, 'You are not allowed to request a drone mission.', 'FORBIDDEN')
  }
  const { patient, incident, location } = await findPatientAndLocation(user, input)
  if (!patient || !location) {
    throw new ApiError(409, 'Patient location is not available.', 'PATIENT_LOCATION_UNAVAILABLE')
  }
  if (incident?.status === 'resolved') {
    throw new ApiError(409, 'A mission cannot be requested for a resolved SOS incident.', 'SOS_ALREADY_RESOLVED')
  }
  if (incident) {
    const existing = await DroneMission.findOne({ sosIncident: incident._id })
    if (existing) {
      return {
        mission: await missionViewQuery(DroneMission.findById(existing._id)).lean(),
        simulation: existing.provider === 'mock',
        duplicate: true,
      }
    }
  }

  const [origin, landingPoint] = await Promise.all([
    nearestDroneOrigin(location),
    nearestLandingPoint(location),
  ])
  const flightDistanceKm = distanceKm(origin.location, landingPoint.location)
  const etaMinutes = env.dronePrepMinutes + Math.ceil((flightDistanceKm / env.droneCruiseSpeedKmh) * 60)
  const eta = new Date(Date.now() + etaMinutes * 60_000)
  const weatherCheck = await checkWeather({
    origin: origin.location,
    destination: landingPoint.location,
    checkedAt: new Date(),
  })
  let mission
  try {
    mission = await DroneMission.create({
      sosIncident: incident?._id,
      patient: patient._id,
      originHealthCentre: origin._id,
      landingPoint: landingPoint._id,
      payload: input.payload,
      status: 'requested',
      eta,
      distanceKm: flightDistanceKm,
      requestedBy: user._id,
      provider: env.droneProvider,
      weatherCheck: {
        checkedAt: weatherCheck.checkedAt ?? new Date(),
        safe: true,
        provider: weatherCheck.provider ?? 'configured-weather-provider',
      },
      timeline: [{ status: 'requested', at: new Date(), actor: user._id }],
    })
  } catch (error) {
    if (error.code === 11000 && incident) {
      const existing = await DroneMission.findOne({ sosIncident: incident._id })
      if (existing) {
        return {
          mission: await missionViewQuery(DroneMission.findById(existing._id)).lean(),
          simulation: existing.provider === 'mock',
          duplicate: true,
        }
      }
    }
    throw error
  }
  await appendIncidentDroneStatus(incident?._id, user._id, 'droneRequested', `Drone mission ${mission._id} requested; awaiting doctor/admin approval.`)
  await recordAudit(user, 'droneMission.request', mission._id, ['status', 'payload', 'landingPoint', 'originHealthCentre'])
  return {
    mission: await missionViewQuery(DroneMission.findById(mission._id)).lean(),
    simulation: env.droneProvider === 'mock',
  }
}

export async function approveDroneMission(user, missionId) {
  if (!['doctor', 'admin'].includes(user.role)) {
    throw new ApiError(403, 'Only a doctor or admin can approve a drone mission.', 'FORBIDDEN')
  }
  if (!mongoose.isValidObjectId(missionId)) throw new ApiError(404, 'Drone mission not found.', 'NOT_FOUND')
  let mission = await DroneMission.findById(missionId)
  if (!mission) throw new ApiError(404, 'Drone mission not found.', 'NOT_FOUND')
  if (!await canAccessPatient(user, mission.patient)) {
    throw new ApiError(403, 'You are not allowed to approve this mission.', 'FORBIDDEN')
  }
  if (!['requested', 'approved'].includes(mission.status)) {
    throw new ApiError(409, 'This mission cannot be approved in its current state.', 'INVALID_STATE_TRANSITION')
  }
  const landingPoint = await LandingPoint.findOne({
    _id: mission.landingPoint,
    isActive: true,
    noFly: false,
    verifiedAt: { $ne: null },
    reverifyAt: { $gt: new Date() },
  }).lean()
  if (!landingPoint) {
    throw new ApiError(409, 'The mission landing point is inactive, unverified, or marked no-fly.', 'LANDING_POINT_UNSAFE')
  }
  const origin = await HealthCentre.findOne({
    _id: mission.originHealthCentre,
    isActive: true,
    hasDrone: true,
  }).lean()
  if (!origin) throw new ApiError(409, 'The mission origin is not an active drone-capable centre.', 'DRONE_ORIGIN_UNAVAILABLE')
  const weatherCheck = await checkWeather({
    origin: origin.location,
    destination: landingPoint.location,
    checkedAt: new Date(),
  })

  if (mission.status === 'requested') {
    mission = await DroneMission.findOneAndUpdate(
      { _id: mission._id, status: 'requested' },
      {
        $set: {
          status: 'approved',
          approvedBy: user._id,
          weatherCheck: {
            checkedAt: weatherCheck.checkedAt ?? new Date(),
            safe: true,
            provider: weatherCheck.provider ?? 'configured-weather-provider',
          },
        },
        $push: { timeline: { status: 'approved', at: new Date(), actor: user._id } },
      },
      { new: true },
    )
    if (!mission) throw new ApiError(409, 'This mission was already approved by another operator.', 'INVALID_STATE_TRANSITION')
    await recordAudit(user, 'droneMission.approve', mission._id, ['status', 'approvedBy'])
  }

  if (mission.status !== 'approved') {
    throw new ApiError(409, 'This mission is not awaiting dispatch.', 'INVALID_STATE_TRANSITION')
  }
  const claimAt = new Date()
  const claimedMission = await DroneMission.findOneAndUpdate(
    {
      _id: mission._id,
      status: 'approved',
      $or: [
        { dispatchClaimedAt: null },
        { dispatchClaimedAt: { $lt: new Date(Date.now() - 2 * 60_000) } },
      ],
    },
    { $set: { dispatchClaimedAt: claimAt } },
    { new: true },
  )
  if (!claimedMission) {
    throw new ApiError(409, 'A dispatch attempt is already in progress.', 'DRONE_DISPATCH_IN_PROGRESS')
  }
  let dispatchResult
  try {
    dispatchResult = await droneProvider.dispatch(claimedMission)
  } catch (error) {
    await DroneMission.updateOne(
      { _id: mission._id, status: 'approved', dispatchClaimedAt: claimAt },
      { $unset: { dispatchClaimedAt: 1 } },
    )
    if (error instanceof ApiError) throw error
    throw new ApiError(502, 'Drone provider dispatch failed; mission remains approved and may be retried.', 'DRONE_PROVIDER_FAILED')
  }
  mission = await DroneMission.findOneAndUpdate(
    { _id: mission._id, status: 'approved', dispatchClaimedAt: claimAt },
    {
      $set: {
        status: 'dispatched',
        providerMissionId: dispatchResult.providerMissionId,
      },
      $unset: { dispatchClaimedAt: 1 },
      $push: { timeline: { status: 'dispatched', at: new Date(), actor: user._id } },
    },
    { new: true },
  )
  if (!mission) throw new ApiError(409, 'Mission state changed during dispatch.', 'INVALID_STATE_TRANSITION')
  await recordAudit(user, 'droneMission.dispatch', mission._id, ['status', 'providerMissionId'])
  const patient = await Patient.findById(mission.patient).select('assignedDoctor').lean()
  await notifyCareTeam(mission, patient)
  const sms = await notifyLandingContact(mission, landingPoint)
  return {
    mission: await missionViewQuery(DroneMission.findById(mission._id)).lean(),
    provider: { name: mission.provider, simulated: dispatchResult.simulation },
    contactSms: sms,
  }
}

export async function abortDroneMission(user, missionId, reason) {
  if (!['doctor', 'admin'].includes(user.role)) {
    throw new ApiError(403, 'Only a doctor or admin can abort a drone mission.', 'FORBIDDEN')
  }
  if (!mongoose.isValidObjectId(missionId)) throw new ApiError(404, 'Drone mission not found.', 'NOT_FOUND')
  const mission = await DroneMission.findById(missionId)
  if (!mission) throw new ApiError(404, 'Drone mission not found.', 'NOT_FOUND')
  if (!await canAccessPatient(user, mission.patient)) {
    throw new ApiError(403, 'You are not allowed to abort this mission.', 'FORBIDDEN')
  }
  if (['delivered', 'aborted'].includes(mission.status)) {
    throw new ApiError(409, 'This mission is already complete.', 'INVALID_STATE_TRANSITION')
  }
  if (mission.dispatchClaimedAt && mission.dispatchClaimedAt.getTime() > Date.now() - 2 * 60_000) {
    throw new ApiError(409, 'Dispatch is in progress; retry abort after the provider responds.', 'DRONE_DISPATCH_IN_PROGRESS')
  }
  if (mission.status === 'dispatched' || mission.status === 'enRoute' || mission.status === 'arrived') {
    try {
      await droneProvider.abort(mission, reason)
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError(502, 'Drone provider could not confirm the abort request.', 'DRONE_PROVIDER_FAILED')
    }
  }
  const aborted = await DroneMission.findOneAndUpdate(
    {
      _id: mission._id,
      status: mission.status,
      $or: [
        { dispatchClaimedAt: null },
        { dispatchClaimedAt: { $lte: new Date(Date.now() - 2 * 60_000) } },
      ],
    },
    {
      $set: { status: 'aborted' },
      $push: { timeline: { status: 'aborted', at: new Date(), actor: user._id, note: reason } },
    },
    { new: true },
  )
  if (!aborted) throw new ApiError(409, 'Mission state changed before abort completed.', 'INVALID_STATE_TRANSITION')
  await recordAudit(user, 'droneMission.abort', mission._id, ['status'])
  return missionViewQuery(DroneMission.findById(aborted._id)).lean()
}

const missionNextStatuses = {
  dispatched: ['enRoute'],
  enRoute: ['arrived'],
  arrived: ['delivered'],
}

export async function updateDroneMissionStatus(user, missionId, { status, note }) {
  if (!['doctor', 'admin'].includes(user.role)) {
    throw new ApiError(403, 'Only a doctor or admin can update mission status.', 'FORBIDDEN')
  }
  if (!mongoose.isValidObjectId(missionId)) throw new ApiError(404, 'Drone mission not found.', 'NOT_FOUND')
  const mission = await DroneMission.findById(missionId)
  if (!mission) throw new ApiError(404, 'Drone mission not found.', 'NOT_FOUND')
  if (!await canAccessPatient(user, mission.patient)) {
    throw new ApiError(403, 'You are not allowed to update this mission.', 'FORBIDDEN')
  }
  if (!missionNextStatuses[mission.status]?.includes(status)) {
    throw new ApiError(409, 'This mission status transition is not permitted.', 'INVALID_STATE_TRANSITION')
  }
  const updated = await DroneMission.findOneAndUpdate(
    { _id: mission._id, status: mission.status },
    {
      $set: { status },
      $push: { timeline: { status, at: new Date(), actor: user._id, note } },
    },
    { new: true },
  )
  if (!updated) throw new ApiError(409, 'Mission state changed before the update completed.', 'INVALID_STATE_TRANSITION')
  await recordAudit(user, `droneMission.${status}`, mission._id, ['status'])
  return missionViewQuery(DroneMission.findById(updated._id)).lean()
}

export async function listDroneMissions(user, filters) {
  const query = filters.status ? { status: filters.status } : {}
  if (user.role === 'patient') {
    const patient = await Patient.findOne({ user: user._id }).select('_id').lean()
    query.patient = patient?._id ?? null
  } else if (user.role === 'doctor') {
    const doctor = await Doctor.findOne({ user: user._id }).select('_id').lean()
    const patients = doctor
      ? await Patient.find({ assignedDoctor: doctor._id }).distinct('_id')
      : []
    query.patient = { $in: patients }
  } else if (user.role === 'chw') {
    if (!filters.patientId || !await canAccessPatient(user, filters.patientId)) {
      throw new ApiError(403, 'CHWs may access missions only for a patient in their assigned villages.', 'FORBIDDEN')
    }
    query.patient = filters.patientId
  } else if (filters.patientId) {
    query.patient = filters.patientId
  }
  const skip = (filters.page - 1) * filters.limit
  const [items, total] = await Promise.all([
    missionViewQuery(DroneMission.find(query).sort({ createdAt: -1 }).skip(skip).limit(filters.limit)).lean(),
    DroneMission.countDocuments(query),
  ])
  return { items, page: filters.page, limit: filters.limit, total, hasMore: skip + items.length < total }
}

export async function getDroneMission(user, missionId) {
  if (!mongoose.isValidObjectId(missionId)) throw new ApiError(404, 'Drone mission not found.', 'NOT_FOUND')
  const mission = await missionViewQuery(DroneMission.findById(missionId)).lean()
  if (!mission) throw new ApiError(404, 'Drone mission not found.', 'NOT_FOUND')
  if (!await canAccessPatient(user, mission.patient._id)) {
    throw new ApiError(403, 'You are not allowed to access this mission.', 'FORBIDDEN')
  }
  return mission
}
