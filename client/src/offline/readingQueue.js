import { offlineDb } from './db.js'

const clientThresholds = {
  bp: {
    systolic: { criticalLow: 80, warningLow: 90, warningHigh: 130, criticalHigh: 180 },
    diastolic: { criticalLow: 50, warningLow: 60, warningHigh: 85, criticalHigh: 120 },
  },
  sugarFasting: { criticalLow: 54, warningLow: 70, warningHigh: 126, criticalHigh: 250 },
  heartRate: { criticalLow: 45, warningLow: 60, warningHigh: 101, criticalHigh: 130, warningLowMin: 50, warningHighMax: 129 },
  spo2: { criticalLow: 91, warningLow: 95 },
}

function classifyMetric(value, thresholds) {
  if (!Number.isFinite(value)) return 'unclassified'
  if (value < thresholds.criticalLow || value >= thresholds.criticalHigh) return 'critical'
  if ((value < thresholds.warningLow && value >= (thresholds.warningLowMin ?? -Infinity))
    || (value >= thresholds.warningHigh && value <= (thresholds.warningHighMax ?? Infinity))) {
    return 'warning'
  }
  if (value >= (thresholds.normalLow ?? thresholds.warningLow)
    && value <= (thresholds.normalHigh ?? thresholds.warningHigh)) return 'normal'
  return 'unclassified'
}

export function previewReadingStatus(reading) {
  if (reading.type === 'bp') {
    const statuses = [
      classifyMetric(reading.values.systolic, clientThresholds.bp.systolic),
      classifyMetric(reading.values.diastolic, clientThresholds.bp.diastolic),
    ]
    if (statuses.includes('critical')) return 'critical'
    if (statuses.includes('warning')) return 'warning'
    return statuses.every((status) => status === 'normal') ? 'normal' : 'unclassified'
  }
  if (reading.type === 'sugar' && reading.values.sugarContext === 'fasting') {
    return classifyMetric(reading.values.value, clientThresholds.sugarFasting)
  }
  if (reading.type === 'heartRate') {
    return classifyMetric(reading.values.value, clientThresholds.heartRate)
  }
  if (reading.type === 'spo2') {
    if (reading.values.value < clientThresholds.spo2.criticalLow) return 'critical'
    if (reading.values.value < clientThresholds.spo2.warningLow) return 'warning'
    return 'normal'
  }
  return 'unclassified'
}

export async function queueReading(userId, reading) {
  if (!userId) throw new Error('A signed-in account is required to queue a reading.')
  const queued = {
    ...reading,
    userId,
    status: 'pending',
    previewStatus: previewReadingStatus(reading),
    createdAt: new Date(),
    error: null,
  }
  await offlineDb.pendingReadings.add(queued)
  return queued
}

export async function cacheReading(userId, record) {
  const patientId = record?.patient?._id ?? record?.patient ?? record?.patientId
  if (!userId || !record?._id || !patientId) return
  await offlineDb.cachedReadings.put({
    ...record,
    id: record._id,
    patientId: String(patientId),
    userId,
  })
}

export async function getCachedReadings(userId, patientId) {
  if (!userId) return []
  const cached = await offlineDb.cachedReadings.where('userId').equals(userId).toArray()
  const pending = await offlineDb.pendingReadings
    .where('userId').equals(userId)
    .filter((reading) => reading.status === 'pending' || reading.status === 'failed')
    .toArray()
  const filtered = patientId
    ? cached.filter((reading) => reading.patientId === String(patientId))
    : cached
  const queued = patientId
    ? pending.filter((reading) => !reading.patientId || reading.patientId === String(patientId))
    : pending
  return [
    ...filtered,
    ...queued.map((reading) => ({
      ...reading,
      id: reading.clientId,
      _offline: true,
      status: reading.previewStatus ?? 'unclassified',
    })),
  ].sort((left, right) => new Date(right.recordedAt) - new Date(left.recordedAt))
}

export async function getPendingReadingCount(userId) {
  if (!userId) return 0
  return offlineDb.pendingReadings
    .where('userId').equals(userId)
    .filter((reading) => reading.status === 'pending' || reading.status === 'failed')
    .count()
}
