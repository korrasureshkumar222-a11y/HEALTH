import Alert from '../models/Alert.js'
import DroneMission from '../models/DroneMission.js'
import HealthRecord from '../models/HealthRecord.js'
import Medication from '../models/Medication.js'
import Note from '../models/Note.js'
import Patient from '../models/Patient.js'
import SosIncident from '../models/SosIncident.js'
import VisitLog from '../models/VisitLog.js'
import ApiError from '../utils/ApiError.js'

function dateFilter(from, to, field = 'createdAt') {
  const range = {}
  if (from) range.$gte = new Date(from)
  if (to) range.$lte = new Date(to)
  return Object.keys(range).length ? { [field]: range } : {}
}

export async function getPatientSummary(patientId, range = {}) {
  const patient = await Patient.findById(patientId)
    .select('user name phone age gender village mandal district conditions bloodGroup assignedDoctor status')
    .populate('user', 'name phone').populate('assignedDoctor', 'specialization hospital user').populate({
    path: 'assignedDoctor', populate: { path: 'user', select: 'name' },
  }).lean()
  if (!patient) throw new ApiError(404, 'Patient was not found.', 'PATIENT_NOT_FOUND')

  const from = range.from ? new Date(range.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const to = range.to ? new Date(range.to) : new Date()
  const timeRange = { recordedAt: { $gte: from, $lte: to } }
  const [readings, alerts, medications, notes] = await Promise.all([
    HealthRecord.find({ patient: patientId, ...timeRange }).sort({ recordedAt: 1 }).lean(),
    Alert.find({ patient: patientId, createdAt: { $gte: from, $lte: to } }).sort({ createdAt: -1 }).lean(),
    Medication.find({ patient: patientId }).sort({ active: -1, startDate: -1 }).lean(),
    Note.find({ patient: patientId, visibility: 'careTeam', createdAt: { $gte: from, $lte: to } })
      .populate('author', 'name role').sort({ createdAt: -1 }).lean(),
  ])

  const stats = Object.fromEntries(['bp', 'sugar', 'heartRate', 'weight', 'spo2', 'temperature'].map((type) => {
    const values = readings.filter((reading) => reading.type === type)
    const scalar = values.map((reading) => reading.values.value).filter(Number.isFinite)
    const systolic = values.map((reading) => reading.values.systolic).filter(Number.isFinite)
    const diastolic = values.map((reading) => reading.values.diastolic).filter(Number.isFinite)
    const average = (items) => items.length ? Number((items.reduce((sum, value) => sum + value, 0) / items.length).toFixed(1)) : null
    return [type, {
      count: values.length,
      average: average(scalar),
      minimum: scalar.length ? Math.min(...scalar) : null,
      maximum: scalar.length ? Math.max(...scalar) : null,
      averageSystolic: average(systolic),
      averageDiastolic: average(diastolic),
      minimumSystolic: systolic.length ? Math.min(...systolic) : null,
      maximumSystolic: systolic.length ? Math.max(...systolic) : null,
      minimumDiastolic: diastolic.length ? Math.min(...diastolic) : null,
      maximumDiastolic: diastolic.length ? Math.max(...diastolic) : null,
      critical: values.filter((reading) => reading.status === 'critical').length,
      warning: values.filter((reading) => reading.status === 'warning').length,
    }]
  }))

  return { patient, period: { from, to }, readings, stats, alerts, medications, notes }
}

export async function getReadingCsv(patientId, range = {}) {
  const filter = { patient: patientId, ...dateFilter(range.from, range.to, 'recordedAt') }
  if (range.type) filter.type = range.type
  return HealthRecord.find(filter).sort({ recordedAt: -1 }).lean()
}

export async function getAdminReports(range = {}) {
  const period = dateFilter(range.from, range.to)
  const [patientsPerVillage, criticalAlertsPerWeek, chwActivity, sosIncidents, droneMissions] = await Promise.all([
    Patient.aggregate([
      { $match: { status: 'active', ...dateFilter(range.from, range.to, 'createdAt') } },
      { $group: { _id: { village: '$village', mandal: '$mandal', district: '$district' }, patients: { $sum: 1 } } },
      { $sort: { '_id.district': 1, '_id.mandal': 1, '_id.village': 1 } },
    ]),
    Alert.aggregate([
      { $match: { severity: 'critical', ...period } },
      { $group: { _id: { $dateTrunc: { date: '$createdAt', unit: 'week', startOfWeek: 'monday' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    VisitLog.aggregate([
      { $match: { ...dateFilter(range.from, range.to, 'date') } },
      { $group: { _id: '$chw', visits: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, missed: { $sum: { $cond: [{ $eq: ['$status', 'missed'] }, 1, 0] } } } },
      { $lookup: { from: 'chws', localField: '_id', foreignField: '_id', as: 'chw' } },
      { $unwind: { path: '$chw', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'users', localField: 'chw.user', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, chwId: '$_id', name: '$user.name', employeeId: '$chw.employeeId', visits: 1, completed: 1, missed: 1 } },
    ]),
    SosIncident.find({ ...period }).select('status createdAt resolvedAt timeline').lean(),
    DroneMission.find({ ...period }).select('status createdAt patient payload distanceKm eta').lean(),
  ])
  const responses = sosIncidents.filter((item) => item.resolvedAt)
  const responseTimes = responses.map((item) => Math.max(0, new Date(item.resolvedAt) - new Date(item.createdAt)) / 60000)
  const sosResponse = {
    total: sosIncidents.length,
    resolved: responses.length,
    unresolved: sosIncidents.length - responses.length,
    averageMinutes: responseTimes.length
      ? Number((responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length).toFixed(1)) : null,
    incidents: sosIncidents.map(({ _id, status, createdAt, resolvedAt }) => ({
      id: _id, status, createdAt, resolvedAt,
      responseMinutes: resolvedAt ? Number(((new Date(resolvedAt) - new Date(createdAt)) / 60000).toFixed(1)) : null,
    })),
  }
  return {
    period: { from: range.from ? new Date(range.from) : null, to: range.to ? new Date(range.to) : null },
    patientsPerVillage,
    criticalAlertsPerWeek: criticalAlertsPerWeek.map(({ _id, count }) => ({ weekStarting: _id, count })),
    chwActivity,
    sosResponse,
    droneMissions: { total: droneMissions.length, byStatus: droneMissions.reduce((result, mission) => {
      result[mission.status] = (result[mission.status] ?? 0) + 1
      return result
    }, {}), items: droneMissions },
  }
}
