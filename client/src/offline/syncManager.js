import { offlineDb } from './db.js'
import { apiClient } from '../api/client.js'

const batchSize = 50
const fallbackIntervalMs = 30_000
let running = false
let timer
let started = false
let currentUserId

function notifySyncChange() {
  window.dispatchEvent(new CustomEvent('offline-sync-change'))
}

function getQueueForUser(table, userId) {
  return table.where('userId').equals(userId)
    .filter((item) => item.status === 'pending' || item.status === 'failed' || item.status === 'retry')
    .toArray()
}

async function saveRetry(table, item, error) {
  const attempts = (item.attempts ?? 0) + 1
  const delay = Math.min(30_000 * (2 ** Math.min(attempts - 1, 6)), 30 * 60_000)
  await table.update(item.id, {
    status: 'pending',
    attempts,
    nextRetryAt: new Date(Date.now() + delay),
    error: error?.message ?? 'Sync will retry when a connection is available.',
  })
}

function toSyncItem(tableName, item) {
  if (tableName === 'pendingReadings') {
    const { clientId, patientId, type, values, recordedAt, notes } = item
    return {
      clientId,
      type: 'reading',
      clientTimestamp: item.createdAt,
      payload: { ...(patientId ? { patientId } : {}), type, values, recordedAt, ...(notes ? { notes } : {}) },
    }
  }
  if (tableName === 'pendingSos') {
    return {
      clientId: item.clientId,
      type: 'sos',
      clientTimestamp: item.createdAt,
      payload: {
        ...(item.patientId ? { patientId: item.patientId } : {}),
        ...(item.location ? { location: item.location } : {}),
      },
    }
    if (tableName === 'pendingVisits') {
      return {
        clientId: item.clientId,
        type: 'visit.create',
        clientTimestamp: item.createdAt,
        payload: item.payload,
      }
    }
  }
  return {
    clientId: item.clientId,
    type: item.operation === 'create' ? 'patient.create' : 'patient.update',
    clientTimestamp: item.clientTimestamp ?? item.createdAt,
    payload: item.operation === 'create'
      ? item.payload
      : { patientId: item.patientId, changes: item.payload },
  }
}

async function persistResult(table, queued, result, userId) {
  if (result.outcome === 'accepted' || result.outcome === 'duplicate') {
    if (table === offlineDb.pendingReadings && result.recordId) {
      const patientId = result.data?.record?.patient?._id
        ?? result.data?.record?.patient
        ?? queued.patientId
      if (patientId) await offlineDb.cachedReadings.put({
        _id: result.recordId,
        id: result.recordId,
        patient: patientId,
        patientId: String(patientId),
        type: queued.type,
        values: queued.values,
        recordedAt: queued.recordedAt,
        status: result.status,
        clientId: queued.clientId,
        userId,
      })
    } else if (table === offlineDb.pendingSos) {
      const incident = result.data?.incident
      if (incident) await offlineDb.cachedSos.put({
        ...incident,
        clientId: queued.clientId,
        userId,
        localOnly: false,
        nearestHealthCentres: result.data.nearestHealthCentres ?? [],
        ...(result.data.emergencySms ? { emergencySms: result.data.emergencySms } : {}),
        updatedAt: new Date(),
      })
    } else if (table === offlineDb.pendingPatients && result.data?.patient) {
      const patient = result.data.patient
      await offlineDb.cachedPatients.put({
        ...patient,
        id: patient._id,
        userId,
        updatedAt: patient.updatedAt ?? result.serverTimestamp,
      })
    } else if (table === offlineDb.pendingVisits && result.data?.visit) {
      await offlineDb.syncMeta.put({
        key: `visit:${userId}:${result.data.visit._id}`,
        value: result.data.visit,
      })
    }
    await table.delete(queued.id)
    return
  }
  const permanent = result.outcome === 'rejected' || result.outcome === 'conflict'
  if (permanent) {
    await table.update(queued.id, {
      status: result.outcome,
      nextRetryAt: null,
      error: result.error?.message ?? 'The server rejected this item.',
      serverTimestamp: result.serverTimestamp,
      conflictData: result.outcome === 'conflict' ? result.data : undefined,
    })
    return
  }
  await saveRetry(table, queued, new Error(result.error?.message ?? 'The server asked to retry this item.'))
  await table.update(queued.id, { serverTimestamp: result.serverTimestamp })
}

export async function syncPendingItems(userId, { force = false } = {}) {
  if (!userId || !navigator.onLine || running) return { synced: 0, pending: 0, skipped: true }
  running = true
  let synced = 0
  try {
    const queues = [
      ['pendingReadings', offlineDb.pendingReadings],
      ['pendingSos', offlineDb.pendingSos],
      ['pendingPatients', offlineDb.pendingPatients],
      ['pendingVisits', offlineDb.pendingVisits],
    ]
    const all = []
    for (const [name, table] of queues) {
      const items = await getQueueForUser(table, userId)
      all.push(...items.filter((item) => force || !item.nextRetryAt || new Date(item.nextRetryAt) <= new Date())
        .map((item) => ({ name, table, item })))
    }
    all.sort((left, right) => new Date(left.item.createdAt) - new Date(right.item.createdAt))

    for (let start = 0; start < all.length; start += batchSize) {
      const batch = all.slice(start, start + batchSize)
      const response = await apiClient.post('/sync', { items: batch.map(({ name, item }) => toSyncItem(name, item)) })
      const results = response.data?.data?.results
      if (!Array.isArray(results)) throw new Error('Sync response did not contain item results.')
      const byClientId = new Map(results.map((result) => [result.clientId, result]))
      for (const entry of batch) {
        const result = byClientId.get(entry.item.clientId)
        if (!result) {
          await saveRetry(entry.table, entry.item, new Error(`Sync response omitted item ${entry.item.clientId}.`))
          continue
        }
        await persistResult(entry.table, entry.item, result, userId)
        if (result.outcome === 'accepted' || result.outcome === 'duplicate') synced += 1
      }
    }
    await offlineDb.syncMeta.put({ key: `lastSyncedAt:${userId}`, value: new Date() })
    return { synced, pending: await getPendingCount(userId) }
  } catch (error) {
    const queues = [offlineDb.pendingReadings, offlineDb.pendingSos, offlineDb.pendingPatients, offlineDb.pendingVisits]
    for (const table of queues) {
      const items = await getQueueForUser(table, userId)
      for (const item of items) {
        if (!item.nextRetryAt || new Date(item.nextRetryAt) <= new Date()) await saveRetry(table, item, error)
      }
    }
    throw error
  } finally {
    running = false
    notifySyncChange()
  }
}

export async function getPendingCount(userId) {
  if (!userId) return 0
  const tables = [offlineDb.pendingReadings, offlineDb.pendingSos, offlineDb.pendingPatients, offlineDb.pendingVisits]
  let total = 0
  for (const table of tables) {
    total += await table.where('userId').equals(userId)
      .filter((item) => item.status !== 'synced')
      .count()
  }
  return total
}

export async function getLastSyncedAt(userId) {
  if (!userId) return null
  return (await offlineDb.syncMeta.get(`lastSyncedAt:${userId}`))?.value ?? null
}

export async function queuePatient(userId, { operation, patientId, payload, clientTimestamp }) {
  if (!userId) throw new Error('A signed-in account is required to queue a patient profile.')
  const record = {
    clientId: crypto.randomUUID(),
    userId,
    operation,
    ...(patientId ? { patientId } : {}),
    payload,
    clientTimestamp: clientTimestamp ?? new Date(),
    createdAt: new Date(),
    status: 'pending',
    attempts: 0,
  }
  await offlineDb.pendingPatients.add(record)
  await requestBackgroundSync()
  notifySyncChange()
  return record
}

export async function queueVisit(userId, payload) {
  if (!userId) throw new Error('A signed-in account is required to queue a home visit.')
  const record = {
    clientId: crypto.randomUUID(),
    userId,
    patientId: payload.patientId,
    payload,
    createdAt: new Date(),
    status: 'pending',
    attempts: 0,
  }
  await offlineDb.pendingVisits.add(record)
  await requestBackgroundSync()
  notifySyncChange()
  return record
}

export async function requestBackgroundSync() {
  notifySyncChange()
  try {
    const registration = await navigator.serviceWorker?.ready
    if (registration && 'sync' in registration) await registration.sync.register('chronic-care-sync')
  } catch (error) {
    console.warn('Background Sync registration is unavailable; the in-app retry timer remains active.', error)
  }
}

export function startSyncManager(userId) {
  currentUserId = userId
  if (!started) {
    started = true
    window.addEventListener('online', handleOnline)
    navigator.serviceWorker?.addEventListener('message', handleWorkerMessage)
    timer = window.setInterval(() => {
      if (currentUserId && navigator.onLine) syncPendingItems(currentUserId).catch((error) => {
        console.warn('Scheduled offline sync failed and will retry.', error.message)
      })
    }, fallbackIntervalMs)
  }
  if (userId && navigator.onLine) {
    syncPendingItems(userId).catch((error) => console.warn('Startup offline sync failed and will retry.', error.message))
  }
}

export function stopSyncManager() {
  currentUserId = undefined
  if (!started) return
  started = false
  window.removeEventListener('online', handleOnline)
  navigator.serviceWorker?.removeEventListener('message', handleWorkerMessage)
  window.clearInterval(timer)
}

function handleOnline() {
  if (currentUserId) syncPendingItems(currentUserId).catch((error) => console.warn('Reconnect sync failed and will retry.', error.message))
}

function handleWorkerMessage(event) {
  if (event.data?.type === 'BACKGROUND_SYNC_FINISHED') {
    notifySyncChange()
    return
  }
  if (event.data?.type === 'BACKGROUND_SYNC_REQUEST' && currentUserId) {
    syncPendingItems(currentUserId)
      .then((result) => {
        if (!result.skipped) event.ports[0]?.postMessage({ type: 'SYNC_FINISHED' })
      })
      .catch((error) => console.warn('Background sync request failed.', error.message))
  }
}

export function subscribeSyncUpdates(callback) {
  window.addEventListener('offline-sync-change', callback)
  return () => window.removeEventListener('offline-sync-change', callback)
}

export function triggerSync(userId) {
  return syncPendingItems(userId, { force: true })
}
