import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { StaleWhileRevalidate } from 'workbox-strategies'

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

const authScopedCacheKey = {
  async cacheKeyWillBeUsed({ request }) {
    const cacheScope = request.headers.get('X-Offline-User')
      ?? request.headers.get('Authorization')
      ?? 'anonymous'
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cacheScope))
    const scope = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    const separator = request.url.includes('?') ? '&' : '?'
    return new Request(`${request.url}${separator}__privateCacheScope=${scope}`)
  },
}

registerRoute(
  ({ url, request }) => request.method === 'GET'
    && url.origin === self.location.origin
    && url.pathname.startsWith('/api/'),
  new StaleWhileRevalidate({
    cacheName: 'private-api-v1',
    plugins: [
      authScopedCacheKey,
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  }),
)

self.addEventListener('sync', (event) => {
  if (event.tag !== 'chronic-care-sync') return
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (windows.length) {
      const completed = await Promise.all(windows.map((client) => new Promise((resolve) => {
        const channel = new MessageChannel()
        const timeout = setTimeout(() => resolve(false), 20_000)
        channel.port1.onmessage = () => {
          clearTimeout(timeout)
          resolve(true)
        }
        client.postMessage({ type: 'BACKGROUND_SYNC_REQUEST' }, [channel.port2])
      })))
      if (completed.every(Boolean)) return
    }
    await syncFromWorker()
  })())
})

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openOfflineDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('chronic-care-client')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Offline database is blocked by another tab.'))
  })
}

async function syncFromWorker() {
  const refreshResponse = await fetch(`${apiBase}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!refreshResponse.ok) return
  const session = await refreshResponse.json()
  const accessToken = session.data?.accessToken
  const userId = session.data?.user?.id ?? session.data?.user?._id
  if (!accessToken || !userId) return

  const database = await openOfflineDatabase()
  try {
    const queueNames = ['pendingReadings', 'pendingSos', 'pendingPatients', 'pendingVisits']
      .filter((name) => database.objectStoreNames.contains(name))
    if (!queueNames.length) return
    const readTransaction = database.transaction(queueNames, 'readonly')
    const queuedByStore = await Promise.all(queueNames.map(async (name) => ({
      name,
      items: (await requestValue(readTransaction.objectStore(name).getAll()))
        .filter((item) => item.userId === userId
          && ['pending', 'failed', 'retry'].includes(item.status)
          && (!item.nextRetryAt || new Date(item.nextRetryAt) <= new Date())),
    })))
    const queued = queuedByStore.flatMap(({ name, items }) => items.map((item) => ({ name, item })))
      .sort((left, right) => new Date(left.item.createdAt) - new Date(right.item.createdAt))

    for (let start = 0; start < queued.length; start += 50) {
      const batch = queued.slice(start, start + 50)
      const items = batch.map(({ name, item }) => {
        if (name === 'pendingReadings') {
          return {
            clientId: item.clientId,
            type: 'reading',
            clientTimestamp: item.createdAt,
            payload: {
              ...(item.patientId ? { patientId: item.patientId } : {}),
              type: item.type,
              values: item.values,
              recordedAt: item.recordedAt,
              ...(item.notes ? { notes: item.notes } : {}),
            },
          }
        }
        if (name === 'pendingSos') {
          return {
            clientId: item.clientId,
            type: 'sos',
            clientTimestamp: item.createdAt,
            payload: {
              ...(item.patientId ? { patientId: item.patientId } : {}),
              ...(item.location ? { location: item.location } : {}),
            },
          }
          if (name === 'pendingVisits') {
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
      })
      const response = await fetch(`${apiBase}/sync`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'X-Offline-User': userId,
        },
        body: JSON.stringify({ items }),
      })
      if (!response.ok) throw new Error(`Background sync returned HTTP ${response.status}.`)
      const resultBody = await response.json()
      const results = new Map((resultBody.data?.results ?? []).map((result) => [result.clientId, result]))
      const stores = [...new Set([...batch.map(({ name }) => name), 'syncMeta', 'cachedPatients', 'cachedReadings', 'cachedSos'])]
        .filter((name) => database.objectStoreNames.contains(name))
      const writeTransaction = database.transaction(stores, 'readwrite')
      for (const entry of batch) {
        const result = results.get(entry.item.clientId)
        if (!result) continue
        const queue = writeTransaction.objectStore(entry.name)
        if (result.outcome === 'accepted' || result.outcome === 'duplicate') {
          queue.delete(entry.item.id)
          if (entry.name === 'pendingReadings' && stores.includes('cachedReadings') && result.recordId) {
            const patientId = result.data?.record?.patient?._id
              ?? result.data?.record?.patient
              ?? entry.item.patientId
            if (patientId) writeTransaction.objectStore('cachedReadings').put({
              id: result.recordId,
              _id: result.recordId,
              patientId: String(patientId),
              patient: patientId,
              userId,
              type: entry.item.type,
              values: entry.item.values,
              recordedAt: entry.item.recordedAt,
              status: result.status,
              clientId: entry.item.clientId,
            })
          } else if (entry.name === 'pendingSos' && stores.includes('cachedSos') && result.data?.incident) {
            writeTransaction.objectStore('cachedSos').put({
              ...result.data.incident,
              clientId: entry.item.clientId,
              userId,
              localOnly: false,
              nearestHealthCentres: result.data.nearestHealthCentres ?? [],
              ...(result.data.emergencySms ? { emergencySms: result.data.emergencySms } : {}),
              updatedAt: new Date(),
            })
          } else if (entry.name === 'pendingPatients' && stores.includes('cachedPatients') && result.data?.patient) {
            writeTransaction.objectStore('cachedPatients').put({
              ...result.data.patient,
              id: result.data.patient._id,
              userId,
              updatedAt: result.data.patient.updatedAt ?? result.serverTimestamp,
            })
          } else if (entry.name === 'pendingVisits' && stores.includes('syncMeta') && result.data?.visit) {
            writeTransaction.objectStore('syncMeta').put({
              key: `visit:${userId}:${result.data.visit._id}`,
              value: result.data.visit,
            })
          }
        } else {
          const permanent = result.outcome === 'rejected' || result.outcome === 'conflict'
          const attempts = (entry.item.attempts ?? 0) + (permanent ? 0 : 1)
          queue.put({
            ...entry.item,
            status: permanent ? result.outcome : 'pending',
            attempts,
            nextRetryAt: permanent ? null : new Date(Date.now() + Math.min(30_000 * (2 ** Math.min(attempts - 1, 6)), 30 * 60_000)),
            error: result.error?.message ?? null,
            serverTimestamp: result.serverTimestamp,
          })
        }
      }
      if (stores.includes('syncMeta')) {
        writeTransaction.objectStore('syncMeta').put({
          key: `lastSyncedAt:${userId}`,
          value: new Date(),
        })
      }
      await new Promise((resolve, reject) => {
        writeTransaction.oncomplete = resolve
        writeTransaction.onerror = () => reject(writeTransaction.error)
        writeTransaction.onabort = () => reject(writeTransaction.error)
      })
    }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    windows.forEach((client) => client.postMessage({ type: 'BACKGROUND_SYNC_FINISHED' }))
  } finally {
    database.close()
  }
}
