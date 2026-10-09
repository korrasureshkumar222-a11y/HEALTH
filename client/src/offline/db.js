import Dexie from 'dexie'

export const offlineDb = new Dexie('chronic-care-client')

offlineDb.version(1).stores({
  pendingReadings: '++id, clientId, patientId, status, createdAt',
  pendingSos: '++id, clientId, patientId, status, createdAt',
  cachedPatients: 'id, village, updatedAt',
  cachedReadings: 'id, patientId, type, recordedAt',
  syncMeta: 'key',
})

offlineDb.version(2).stores({
  pendingReadings: '++id, &clientId, patientId, userId, status, createdAt',
  pendingSos: '++id, clientId, patientId, status, createdAt',
  cachedPatients: 'id, village, updatedAt',
  cachedReadings: 'id, patientId, userId, type, status, recordedAt',
  syncMeta: 'key',
})

offlineDb.version(3).stores({
  pendingReadings: '++id, &clientId, patientId, userId, status, createdAt',
  pendingSos: '++id, &clientId, patientId, userId, status, createdAt',
  cachedPatients: 'id, village, updatedAt',
  cachedReadings: 'id, patientId, userId, type, status, recordedAt',
  cachedSos: '&clientId, userId, updatedAt',
  syncMeta: 'key',
})

offlineDb.version(4).stores({
  pendingReadings: '++id, &clientId, patientId, userId, status, createdAt',
  pendingSos: '++id, &clientId, patientId, userId, status, createdAt',
  cachedPatients: 'id, village, updatedAt',
  cachedReadings: 'id, patientId, userId, type, status, recordedAt',
  cachedSos: '&clientId, userId, updatedAt',
  cachedSosContacts: 'userId, updatedAt',
  syncMeta: 'key',
})

offlineDb.version(5).stores({
  pendingReadings: '++id, &clientId, patientId, userId, status, createdAt, nextRetryAt',
  pendingSos: '++id, &clientId, patientId, userId, status, createdAt, nextRetryAt',
  pendingPatients: '++id, &clientId, userId, operation, patientId, status, createdAt, nextRetryAt',
  cachedPatients: 'id, village, updatedAt, userId',
  cachedReadings: 'id, patientId, userId, type, status, recordedAt',
  cachedSos: '&clientId, userId, updatedAt',
  cachedSosContacts: 'userId, updatedAt',
  syncMeta: 'key',
})

offlineDb.version(6).stores({
  pendingReadings: '++id, &clientId, patientId, userId, status, createdAt, nextRetryAt',
  pendingSos: '++id, &clientId, patientId, userId, status, createdAt, nextRetryAt',
  pendingPatients: '++id, &clientId, userId, operation, patientId, status, createdAt, nextRetryAt',
  pendingVisits: '++id, &clientId, userId, patientId, status, createdAt, nextRetryAt',
  cachedPatients: 'id, village, updatedAt, userId',
  cachedReadings: 'id, patientId, userId, type, status, recordedAt',
  cachedSos: '&clientId, userId, updatedAt',
  cachedSosContacts: 'userId, updatedAt',
  syncMeta: 'key',
})

offlineDb.version(7).stores({
  pendingReadings: '++id, &clientId, patientId, userId, status, createdAt, nextRetryAt',
  pendingSos: '++id, &clientId, patientId, userId, status, createdAt, nextRetryAt',
  pendingPatients: '++id, &clientId, userId, operation, patientId, status, createdAt, nextRetryAt',
  pendingVisits: '++id, &clientId, userId, patientId, status, createdAt, nextRetryAt',
  cachedPatients: 'id, village, updatedAt, userId',
  cachedReadings: 'id, patientId, userId, type, status, recordedAt',
  cachedSos: '&clientId, userId, updatedAt',
  cachedSosContacts: 'userId, updatedAt',
  cachedHealthCentres: '&cacheKey, updatedAt',
  syncMeta: 'key',
})
