import { beforeEach, describe, expect, it } from 'vitest'
import { offlineDb } from './db.js'
import {
  cacheReading,
  getCachedReadings,
  getPendingReadingCount,
  previewReadingStatus,
  queueReading,
} from './readingQueue.js'

describe('offline reading queue', () => {
  beforeEach(async () => {
    await offlineDb.open()
    await Promise.all([
      offlineDb.pendingReadings.clear(),
      offlineDb.cachedReadings.clear(),
    ])
  })

  it('queues a reading once, classifies its preview and lists it offline', async () => {
    const reading = {
      clientId: 'bp-client-1',
      type: 'bp',
      values: { systolic: 184, diastolic: 122, unit: 'mmHg' },
      recordedAt: new Date().toISOString(),
    }

    const queued = await queueReading('user-1', reading)

    expect(queued.status).toBe('pending')
    expect(queued.previewStatus).toBe('critical')
    expect(await getPendingReadingCount('user-1')).toBe(1)
    await expect(queueReading('user-1', reading)).rejects.toMatchObject({ name: 'ConstraintError' })
    expect(await getPendingReadingCount('user-1')).toBe(1)
    expect(await getCachedReadings('user-1')).toEqual([
      expect.objectContaining({ id: 'bp-client-1', _offline: true, status: 'critical' }),
    ])
  })

  it('caches server readings and scopes returned records to a user', async () => {
    await cacheReading('user-1', {
      _id: 'record-1',
      patient: { _id: 'patient-1' },
      type: 'bp',
      recordedAt: new Date().toISOString(),
    })
    await cacheReading('user-2', {
      _id: 'record-2',
      patient: 'patient-1',
      type: 'bp',
      recordedAt: new Date().toISOString(),
    })

    const records = await getCachedReadings('user-1', 'patient-1')
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ id: 'record-1', patientId: 'patient-1' })
  })

  it('rejects queueing without a signed-in user', async () => {
    await expect(queueReading('', { clientId: 'no-user' })).rejects.toThrow(
      'A signed-in account is required to queue a reading.',
    )
  })

  it('classifies each supported vital type and leaves unsupported values unclassified', () => {
    const status = (type, values) => previewReadingStatus({ type, values })

    expect(status('bp', { systolic: 120, diastolic: 80 })).toBe('normal')
    expect(status('bp', { systolic: 135, diastolic: 80 })).toBe('warning')
    expect(status('bp', { systolic: Number.NaN, diastolic: 80 })).toBe('unclassified')
    expect(status('sugar', { value: 180, sugarContext: 'fasting' })).toBe('warning')
    expect(status('sugar', { value: 180, sugarContext: 'random' })).toBe('unclassified')
    expect(status('heartRate', { value: 40 })).toBe('critical')
    expect(status('heartRate', { value: 55 })).toBe('warning')
    expect(status('heartRate', { value: 88 })).toBe('normal')
    expect(status('spo2', { value: 90 })).toBe('critical')
    expect(status('spo2', { value: 94 })).toBe('warning')
    expect(status('spo2', { value: 98 })).toBe('normal')
    expect(status('unknown', { value: 10 })).toBe('unclassified')
    expect(status('heartRate', { value: Number.NaN })).toBe('unclassified')
  })

  it('filters cached and pending readings by patient and ignores completed queue entries', async () => {
    await cacheReading('', { _id: 'no-user', patient: 'patient-1' })
    await cacheReading('user-1', { patient: 'patient-1' })
    await cacheReading('user-1', { _id: 'no-patient' })
    await offlineDb.pendingReadings.bulkAdd([
      {
        clientId: 'pending-for-patient',
        userId: 'user-1',
        patientId: 'patient-1',
        status: 'failed',
        recordedAt: new Date('2026-01-02T00:00:00Z'),
      },
      {
        clientId: 'pending-without-patient',
        userId: 'user-1',
        status: 'pending',
        recordedAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        clientId: 'synced',
        userId: 'user-1',
        patientId: 'patient-1',
        status: 'synced',
        recordedAt: new Date(),
      },
      {
        clientId: 'other-user',
        userId: 'user-2',
        status: 'pending',
        recordedAt: new Date(),
      },
    ])

    expect(await getCachedReadings('')).toEqual([])
    const scoped = await getCachedReadings('user-1', 'patient-1')
    expect(scoped.map((reading) => reading.id)).toEqual([
      'pending-for-patient',
      'pending-without-patient',
    ])
    expect(await getPendingReadingCount('user-1')).toBe(2)
    expect(await getPendingReadingCount('')).toBe(0)
  })
})
