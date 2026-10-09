import { offlineDb } from './db.js'

export async function cachePatient(userId, patient) {
  if (!userId || !patient?._id) return
  await offlineDb.cachedPatients.put({
    ...patient,
    id: String(patient._id),
    userId,
    updatedAt: patient.updatedAt ?? new Date(),
  })
}

export async function getCachedPatient(userId, patientId) {
  if (!userId || !patientId) return null
  return offlineDb.cachedPatients.get(String(patientId))
}

export async function listCachedPatients(userId) {
  if (!userId) return []
  return offlineDb.cachedPatients.where('userId').equals(userId).toArray()
}
