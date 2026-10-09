import mongoose from 'mongoose'
import Alert from '../models/Alert.js'
import AuditLog from '../models/AuditLog.js'
import HealthRecord from '../models/HealthRecord.js'
import Patient from '../models/Patient.js'
import ApiError from '../utils/ApiError.js'
import { createReadingAlert } from './alertService.js'
import { classifyReading } from './classifier.js'
import { canAccessPatient } from './permissions.js'

async function resolvePatient(user, patientId) {
  const resolvedPatientId = patientId
    ?? (user.role === 'patient'
      ? (await Patient.findOne({ user: user._id }).select('_id').lean())?._id?.toString()
      : undefined)
  if (!resolvedPatientId) {
    throw new ApiError(400, 'A patient ID is required for this reading.', 'PATIENT_ID_REQUIRED')
  }
  if (!await canAccessPatient(user, resolvedPatientId)) {
    throw new ApiError(403, 'You are not allowed to record readings for this patient.', 'FORBIDDEN')
  }
  return resolvedPatientId
}

async function findDuplicate(clientId, patientId, user) {
  const existing = await HealthRecord.findOne({ clientId })
  if (!existing) return null
  if (existing.patient.toString() !== patientId.toString()
    || existing.recordedBy.toString() !== user._id.toString()) {
    throw new ApiError(409, 'This client ID is already associated with another reading.', 'CLIENT_ID_CONFLICT')
  }
  const alert = await createReadingAlert(existing)
  return { record: existing, alert, duplicate: true }
}

export async function createReading(user, input) {
  const patientId = await resolvePatient(user, input.patientId)
  const duplicate = await findDuplicate(input.clientId, patientId, user)
  if (duplicate) return duplicate

  const classification = classifyReading(input)
  let record
  try {
    record = await HealthRecord.create({
      patient: patientId,
      type: input.type,
      values: input.values,
      recordedAt: input.recordedAt,
      recordedBy: user._id,
      source: user.role === 'chw' ? 'chw' : 'self',
      clientId: input.clientId,
      notes: input.notes,
      status: classification.status,
      classification: {
        rulesetVersion: classification.rulesetVersion,
        classifiedAt: classification.classifiedAt,
      },
    })
  } catch (error) {
    if (error.code !== 11000) throw error
    const racedDuplicate = await findDuplicate(input.clientId, patientId, user)
    if (racedDuplicate) return racedDuplicate
    throw error
  }
  const alert = await createReadingAlert(record)
  return { record, alert, duplicate: false }
}

export async function createSmsReading(patient, input) {
  const reading = { ...input, recordedAt: new Date() }
  const classification = classifyReading(reading)
  const record = await HealthRecord.create({
    patient: patient._id,
    type: reading.type,
    values: reading.values,
    recordedAt: reading.recordedAt,
    recordedBy: patient.user?._id ?? patient.user,
    source: 'sms',
    status: classification.status,
    classification: {
      rulesetVersion: classification.rulesetVersion,
      classifiedAt: classification.classifiedAt,
    },
  })
  const alert = await createReadingAlert(record)
  return { record, alert }
}

export async function createReadingsBatch(user, items, parseReading) {
  const results = []
  for (const rawItem of items) {
    const parsed = parseReading(rawItem)
    const clientId = typeof rawItem?.clientId === 'string' ? rawItem.clientId : undefined
    if (!parsed.success) {
      results.push({
        clientId,
        outcome: 'rejected',
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Reading data is invalid.',
          details: parsed.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
      })
      continue
    }

    try {
      const result = await createReading(user, parsed.data)
      results.push({
        clientId: parsed.data.clientId,
        outcome: result.duplicate ? 'duplicate' : 'accepted',
        recordId: result.record._id,
        status: result.record.status,
        alertId: result.alert?._id,
      })
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode >= 500) throw error
      results.push({
        clientId: parsed.data.clientId,
        outcome: 'rejected',
        error: { code: error.code, message: error.message },
      })
    }
  }
  return results
}

export async function listReadings(patientId, filters) {
  const query = { patient: patientId }
  if (filters.type) query.type = filters.type
  if (filters.status) query.status = filters.status
  if (filters.from || filters.to) {
    query.recordedAt = {}
    if (filters.from) query.recordedAt.$gte = new Date(filters.from)
    if (filters.to) query.recordedAt.$lte = new Date(filters.to)
  }

  const skip = (filters.page - 1) * filters.limit
  const [items, total] = await Promise.all([
    HealthRecord.find(query)
      .sort({ recordedAt: -1, _id: -1 })
      .skip(skip)
      .limit(filters.limit)
      .lean(),
    HealthRecord.countDocuments(query),
  ])
  return {
    items,
    page: filters.page,
    limit: filters.limit,
    total,
    hasMore: skip + items.length < total,
  }
}

function metricStatistics(field) {
  return {
    [`${field}Average`]: { $avg: `$values.${field}` },
    [`${field}Highest`]: { $max: `$values.${field}` },
    [`${field}Lowest`]: { $min: `$values.${field}` },
  }
}

function dailyMetricStatistics(field) {
  return {
    [`${field}Average`]: { $avg: `$values.${field}` },
    [`${field}Max`]: { $max: `$values.${field}` },
    [`${field}Min`]: { $min: `$values.${field}` },
  }
}

export async function getReadingSeries(patientId, { type, range }, now = new Date()) {
  const days = Number.parseInt(range, 10)
  const end = new Date(now)
  const start = new Date(Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate() - days + 1,
  ))
  const bloodPressure = type === 'bp'
  const metrics = bloodPressure ? ['systolic', 'diastolic'] : ['value']
  const summaryMetrics = Object.assign({}, ...metrics.map(metricStatistics))
  const dailyMetrics = Object.assign({}, ...metrics.map(dailyMetricStatistics))
  const summaryProjection = {
    totalReadings: '$totalReadings',
    classifiedReadings: '$classifiedReadings',
    percentInRange: {
      $cond: [
        { $gt: ['$classifiedReadings', 0] },
        { $multiply: [{ $divide: ['$inRangeReadings', '$classifiedReadings'] }, 100] },
        null,
      ],
    },
    ...Object.fromEntries(metrics.map((metric) => [
      metric,
      {
        average: `$${metric}Average`,
        highest: `$${metric}Highest`,
        lowest: `$${metric}Lowest`,
      },
    ])),
  }
  const dailyMetricProjection = Object.fromEntries(metrics.map((metric) => [
    metric,
    {
      average: `$${metric}Average`,
      max: `$${metric}Max`,
      min: `$${metric}Min`,
    },
  ]))

  const [result] = await HealthRecord.aggregate([
    {
      $match: {
        patient: new mongoose.Types.ObjectId(patientId),
        type,
        recordedAt: { $gte: start, $lte: end },
      },
    },
    {
      $facet: {
        points: [
          {
            $group: {
              _id: {
                $dateTrunc: { date: '$recordedAt', unit: 'day', timezone: 'UTC' },
              },
              count: { $sum: 1 },
              ...dailyMetrics,
            },
          },
          { $sort: { _id: 1 } },
          {
            $project: {
              _id: 0,
              at: '$_id',
              count: 1,
              ...dailyMetricProjection,
            },
          },
        ],
        summary: [
          {
            $group: {
              _id: null,
              totalReadings: { $sum: 1 },
              classifiedReadings: {
                $sum: {
                  $cond: [{ $in: ['$status', ['normal', 'warning', 'critical']] }, 1, 0],
                },
              },
              inRangeReadings: { $sum: { $cond: [{ $eq: ['$status', 'normal'] }, 1, 0] } },
              ...summaryMetrics,
            },
          },
          { $project: { _id: 0, ...summaryProjection } },
        ],
      },
    },
  ])
  const summary = result?.summary?.[0] ?? {
    totalReadings: 0,
    classifiedReadings: 0,
    percentInRange: null,
    ...Object.fromEntries(metrics.map((metric) => [
      metric,
      { average: null, highest: null, lowest: null },
    ])),
  }

  return {
    type,
    range,
    from: start,
    to: end,
    points: result?.points ?? [],
    summary,
  }
}

export async function deleteReading(user, patientId, recordId, reason) {
  const record = await HealthRecord.findOne({ _id: recordId, patient: patientId })
  if (!record) throw new ApiError(404, 'Reading not found.', 'NOT_FOUND')

  await HealthRecord.deleteOne({ _id: record._id })
  await Alert.deleteOne({ record: record._id })
  await AuditLog.create({
    actor: user._id,
    actorRole: user.role,
    action: 'reading.delete',
    resourceType: 'HealthRecord',
    resourceId: record._id,
    reason,
    changedFields: ['deleted'],
  })
}
