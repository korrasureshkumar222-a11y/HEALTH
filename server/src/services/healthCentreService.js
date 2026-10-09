import mongoose from 'mongoose'
import AuditLog from '../models/AuditLog.js'
import HealthCentre from '../models/HealthCentre.js'
import ApiError from '../utils/ApiError.js'

export async function findNearestHealthCentres({ lat, lng, limit, type }) {
  const query = { isActive: true }
  if (type) query.type = type

  return HealthCentre.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMeters',
        spherical: true,
        key: 'location',
        query,
      },
    },
    { $limit: limit },
    {
      $addFields: {
        distanceKm: { $round: [{ $divide: ['$distanceMeters', 1000] }, 1] },
      },
    },
    {
      $project: {
        name: 1,
        type: 1,
        address: 1,
        phone: 1,
        services: 1,
        hasAmbulance: 1,
        hasLandingPoint: 1,
        hasDrone: 1,
        is24x7: 1,
        location: 1,
        distanceMeters: 1,
        distanceKm: 1,
      },
    },
  ])
}

export async function listHealthCentres(filters) {
  const query = {}
  if (filters.status !== 'all') query.isActive = filters.status === 'active'
  if (filters.type) query.type = filters.type
  const skip = (filters.page - 1) * filters.limit
  const [items, total] = await Promise.all([
    HealthCentre.find(query)
      .sort({ name: 1, _id: 1 })
      .skip(skip)
      .limit(filters.limit)
      .lean(),
    HealthCentre.countDocuments(query),
  ])
  return { items, page: filters.page, limit: filters.limit, total, hasMore: skip + items.length < total }
}

export async function listBookableHealthCentres() {
  return HealthCentre.find({ isActive: true })
    .select('name address type')
    .sort({ name: 1, _id: 1 })
    .limit(200)
    .lean()
}

async function writeAudit(user, action, centreId, changedFields) {
  await AuditLog.create({
    actor: user._id,
    actorRole: user.role,
    action,
    resourceType: 'HealthCentre',
    resourceId: centreId,
    changedFields: [...new Set(changedFields)].sort(),
  })
}

export async function createHealthCentre(user, input) {
  const centre = await HealthCentre.create(input)
  await writeAudit(user, 'healthCentre.create', centre._id, Object.keys(input))
  return centre.toObject()
}

export async function getHealthCentre(centreId) {
  if (!mongoose.isValidObjectId(centreId)) {
    throw new ApiError(404, 'Health centre not found.', 'NOT_FOUND')
  }
  const centre = await HealthCentre.findById(centreId).lean()
  if (!centre) throw new ApiError(404, 'Health centre not found.', 'NOT_FOUND')
  return centre
}

export async function updateHealthCentre(user, centreId, input) {
  if (!mongoose.isValidObjectId(centreId)) {
    throw new ApiError(404, 'Health centre not found.', 'NOT_FOUND')
  }
  const centre = await HealthCentre.findByIdAndUpdate(
    centreId,
    { $set: input },
    { new: true, runValidators: true },
  ).lean()
  if (!centre) throw new ApiError(404, 'Health centre not found.', 'NOT_FOUND')
  await writeAudit(user, 'healthCentre.update', centre._id, Object.keys(input))
  return centre
}

export async function deactivateHealthCentre(user, centreId) {
  if (!mongoose.isValidObjectId(centreId)) {
    throw new ApiError(404, 'Health centre not found.', 'NOT_FOUND')
  }
  const centre = await HealthCentre.findByIdAndUpdate(
    centreId,
    { $set: { isActive: false } },
    { new: true, runValidators: true },
  ).lean()
  if (!centre) throw new ApiError(404, 'Health centre not found.', 'NOT_FOUND')
  await writeAudit(user, 'healthCentre.deactivate', centre._id, ['isActive'])
  return centre
}
