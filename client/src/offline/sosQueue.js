import { offlineDb } from './db.js'

export async function queueSos(userId, request) {
  if (!userId) throw new Error('A signed-in account is required to queue an SOS request.')
  const queued = {
    ...request,
    userId,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  await offlineDb.pendingSos.put(queued)
  await offlineDb.cachedSos.put({ ...queued, localOnly: true })
  return queued
}

export async function cacheSos(userId, response) {
  const incident = response?.incident
  if (!userId || !incident?.clientId) return
  await offlineDb.cachedSos.put({
    _id: incident._id,
    patient: typeof incident.patient === 'string' ? incident.patient : undefined,
    location: incident.location,
    status: incident.status,
    timeline: incident.timeline ?? [],
    resolvedBy: typeof incident.resolvedBy === 'string' ? incident.resolvedBy : undefined,
    resolvedAt: incident.resolvedAt,
    createdAt: incident.createdAt,
    clientId: incident.clientId,
    userId,
    localOnly: false,
    nearestHealthCentres: response.nearestHealthCentres ?? [],
    ...(response.emergencySms ? { emergencySms: response.emergencySms } : {}),
    updatedAt: new Date(),
  })
}

export async function getLatestSos(userId) {
  if (!userId) return null
  const entries = await offlineDb.cachedSos.where('userId').equals(userId).toArray()
  return entries.sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))[0] ?? null
}

export async function cacheEmergencyPhones(userId, contacts, location) {
  if (!userId) return
  const phones = contacts
    .filter((contact) => contact.consentToContact !== false && contact.phone)
    .map((contact) => contact.phone)
  await offlineDb.cachedSosContacts.put({
    userId,
    phones,
    location,
    updatedAt: new Date(),
  })
}

export async function getCachedEmergencyPhones(userId) {
  if (!userId) return []
  const cache = await offlineDb.cachedSosContacts.get(userId)
  return cache?.phones ?? []
}

export async function getCachedSosLocation(userId) {
  if (!userId) return null
  const cache = await offlineDb.cachedSosContacts.get(userId)
  return cache?.location ?? null
}

export async function clearCachedEmergencyPhones(userId) {
  if (!userId) return
  await offlineDb.cachedSosContacts.delete(userId)
}
