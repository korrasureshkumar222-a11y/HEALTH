import { offlineDb } from './db.js'

function roundedCoordinate(value) {
  return Number(value).toFixed(3)
}

export function healthCentreCacheKey({ lat, lng, limit, type }) {
  return [
    roundedCoordinate(lat),
    roundedCoordinate(lng),
    limit,
    type ?? 'all',
  ].join(':')
}

export async function cacheHealthCentres(params, items) {
  const cacheKey = healthCentreCacheKey(params)
  await offlineDb.cachedHealthCentres.put({
    cacheKey,
    items,
    updatedAt: new Date(),
  })
}

export async function getCachedHealthCentres(params) {
  return offlineDb.cachedHealthCentres.get(healthCentreCacheKey(params))
}
