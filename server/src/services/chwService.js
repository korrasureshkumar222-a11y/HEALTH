import Alert from '../models/Alert.js'
import Chw from '../models/Chw.js'
import HealthRecord from '../models/HealthRecord.js'
import Patient from '../models/Patient.js'
import VisitLog from '../models/VisitLog.js'
import User from '../models/User.js'
import ApiError from '../utils/ApiError.js'
import { canAccessPatient } from './permissions.js'

const dayMs = 24 * 60 * 60 * 1000
const timeZone = 'Asia/Kolkata'

function startOfDayInIndia(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type) => parts.find((item) => item.type === type).value
  return new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00+05:30`)
}

function startOfWeekInIndia(date = new Date()) {
  const start = startOfDayInIndia(date)
  const weekday = Number(new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
    .formatToParts(date).find((part) => part.type === 'weekday').value
    .replace('Sun', '0').replace('Mon', '1').replace('Tue', '2').replace('Wed', '3')
    .replace('Thu', '4').replace('Fri', '5').replace('Sat', '6'))
  const daysSinceMonday = (weekday + 6) % 7
  return new Date(start.getTime() - daysSinceMonday * dayMs)
}

function villagesFor(chw) {
  return (chw.assignedVillages ?? []).map((location) => ({
    village: new RegExp(`^${location.village.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    ...(location.mandal ? { mandal: new RegExp(`^${location.mandal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } : {}),
    ...(location.district ? { district: new RegExp(`^${location.district.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } : {}),
  }))
}

async function getChwProfile(user) {
  const chw = await Chw.findOne({ user: user._id }).select('_id assignedVillages employeeId').lean()
  if (!chw) throw new ApiError(404, 'CHW profile not found.', 'CHW_PROFILE_NOT_FOUND')
  return chw
}

async function scopedPatientIds(user, chw) {
  const villages = villagesFor(chw)
  if (!villages.length) return []
  return Patient.find({ status: 'active', $or: villages }).distinct('_id')
}

export async function getChwDashboard(user) {
  const chw = await getChwProfile(user)
  const villages = chw.assignedVillages ?? []
  const patientIds = await scopedPatientIds(user, chw)
  const today = startOfDayInIndia()
  const tomorrow = new Date(today.getTime() + dayMs)
  const [patients, todayRecords] = await Promise.all([
    Patient.find({ _id: { $in: patientIds }, status: 'active' })
      .populate('user', 'name phone')
      .select('name phone user village mandal district conditions location assignedChw')
      .sort({ district: 1, mandal: 1, village: 1, _id: 1 })
      .lean(),
    HealthRecord.find({ patient: { $in: patientIds }, recordedAt: { $gte: today, $lt: tomorrow } })
      .select('patient type values status recordedAt')
      .sort({ recordedAt: -1, _id: -1 })
      .lean(),
  ])
  const readingsByPatient = new Map()
  const latestByPatient = new Map()
  for (const record of todayRecords) {
    const key = record.patient.toString()
    readingsByPatient.set(key, (readingsByPatient.get(key) ?? 0) + 1)
    if (!latestByPatient.has(key)) latestByPatient.set(key, record)
  }
  const patientRows = patients.map((patient) => {
    const key = patient._id.toString()
    const latest = latestByPatient.get(key) ?? null
    return {
      ...patient,
      name: patient.user?.name ?? patient.name,
      phone: patient.user?.phone ?? patient.phone,
      todayReadingCount: readingsByPatient.get(key) ?? 0,
      pendingReadingToday: !readingsByPatient.has(key),
      latestReading: latest,
      villageKey: [patient.district, patient.mandal, patient.village].filter(Boolean).join('|').toLowerCase(),
    }
  })
  const villageSummaries = villages.map((location) => {
    const villagePatients = patientRows.filter((patient) => (
      patient.village.toLocaleLowerCase('en') === location.village.toLocaleLowerCase('en')
      && (!location.mandal || patient.mandal?.toLocaleLowerCase('en') === location.mandal.toLocaleLowerCase('en'))
      && (!location.district || patient.district?.toLocaleLowerCase('en') === location.district.toLocaleLowerCase('en'))
    ))
    return {
      ...location,
      patientCount: villagePatients.length,
      pendingReadings: villagePatients.filter((patient) => patient.pendingReadingToday).length,
    }
  })
  const [openAlerts, visitsToday] = await Promise.all([
    Alert.countDocuments({ patient: { $in: patientIds }, status: 'open' }),
    VisitLog.countDocuments({ chw: chw._id, date: { $gte: today, $lt: tomorrow }, status: 'completed' }),
  ])
  return {
    villages: villageSummaries,
    patients: patientRows,
    summary: {
      totalPatients: patientRows.length,
      pendingReadingsToday: patientRows.filter((patient) => patient.pendingReadingToday).length,
      openAlerts,
      visitsCompletedToday: visitsToday,
    },
  }
}

export async function listChwVisits(user, filters) {
  const chw = await getChwProfile(user)
  const patientIds = await scopedPatientIds(user, chw)
  const query = { chw: chw._id, patient: { $in: patientIds } }
  if (filters.from || filters.to) {
    query.date = {
      ...(filters.from ? { $gte: new Date(filters.from) } : {}),
      ...(filters.to ? { $lte: new Date(filters.to) } : {}),
    }
  }
  if (filters.status) query.status = filters.status
  if (filters.village) {
    const village = villagesFor(chw).find(({ village: matcher }) => matcher.test(filters.village))
    if (!village) return { items: [] }
    const matchingPatients = await Patient.find({ ...village, status: 'active' }).distinct('_id')
    query.patient = { $in: matchingPatients }
  }
  const items = await VisitLog.find(query)
    .populate({
      path: 'patient',
      select: 'name phone village mandal district user',
      populate: { path: 'user', select: 'name phone' },
    })
    .sort({ date: 1, _id: 1 })
    .limit(500)
    .lean()
  return { items }
}

export async function createChwVisit(user, input) {
  const chw = await getChwProfile(user)
  if (!await canAccessPatient(user, input.patientId)) {
    throw new ApiError(403, 'You can only log visits for patients in your assigned villages.', 'FORBIDDEN')
  }
  if (input.clientId) {
    const existing = await VisitLog.findOne({ clientId: input.clientId }).lean()
    if (existing) {
      if (existing.chw.toString() !== chw._id.toString()
        || existing.patient.toString() !== input.patientId.toString()) {
        throw new ApiError(409, 'This visit ID is already in use.', 'CLIENT_ID_CONFLICT')
      }
      return { visit: existing, duplicate: true }
    }
  }
  try {
    const visit = await VisitLog.create({
      chw: chw._id,
      patient: input.patientId,
      createdBy: user._id,
      clientId: input.clientId,
      date: input.date,
      status: input.status,
      checklist: input.checklist,
      notes: input.notes,
      location: input.location,
    })
    return { visit, duplicate: false }
  } catch (error) {
    if (error.code !== 11000 || !input.clientId) throw error
    const existing = await VisitLog.findOne({ clientId: input.clientId }).lean()
    if (!existing || existing.chw.toString() !== chw._id.toString()) {
      throw new ApiError(409, 'This visit ID is already in use.', 'CLIENT_ID_CONFLICT')
    }
    return { visit: existing, duplicate: true }
  }
}

export async function updateChwVisit(user, visitId, changes) {
  const chw = await getChwProfile(user)
  const visit = await VisitLog.findOne({ _id: visitId, chw: chw._id })
  if (!visit) throw new ApiError(404, 'Visit not found.', 'NOT_FOUND')
  if (!await canAccessPatient(user, visit.patient)) {
    throw new ApiError(403, 'You can only update visits for patients in your assigned villages.', 'FORBIDDEN')
  }
  Object.assign(visit, changes)
  await visit.save()
  return visit.populate('patient', 'name phone village mandal district')
}

export async function getChwPerformance(user, query = {}) {
  const chw = await getChwProfile(user)
  const from = query.from ? new Date(query.from) : startOfWeekInIndia()
  const to = query.to ? new Date(query.to) : new Date(startOfDayInIndia().getTime() + dayMs)
  if (from >= to) throw new ApiError(400, 'The performance date range is invalid.', 'INVALID_DATE_RANGE')
  const patientIds = await scopedPatientIds(user, chw)
  const range = { $gte: from, $lt: to }
  const [visits, readings, alertsHandled] = await Promise.all([
    VisitLog.find({ chw: chw._id, patient: { $in: patientIds }, status: 'completed', date: range })
      .distinct('patient'),
    HealthRecord.find({ recordedBy: user._id, patient: { $in: patientIds }, recordedAt: range })
      .select('patient')
      .lean(),
    Alert.countDocuments({
      patient: { $in: patientIds },
      $or: [
        { acknowledgedBy: user._id, acknowledgedAt: range },
        { resolvedBy: user._id, resolvedAt: range },
      ],
    }),
  ])
  const covered = new Set([...visits.map(String), ...readings.map(({ patient }) => patient.toString())])
  return {
    from,
    to,
    patientsCovered: covered.size,
    readingsEntered: readings.length,
    alertsHandled,
  }
}
