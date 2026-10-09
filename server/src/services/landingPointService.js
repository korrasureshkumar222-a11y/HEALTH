import mongoose from 'mongoose'
import AuditLog from '../models/AuditLog.js'
import Chw from '../models/Chw.js'
import LandingPoint from '../models/LandingPoint.js'
import ApiError from '../utils/ApiError.js'

function villageMatches(point, assignedVillages) {
  return assignedVillages.some((location) => (
    location.village.toLocaleLowerCase('en') === point.village.toLocaleLowerCase('en')
      && (!location.mandal || location.mandal.toLocaleLowerCase('en') === point.mandal?.toLocaleLowerCase('en'))
      && (!location.district || location.district.toLocaleLowerCase('en') === point.district?.toLocaleLowerCase('en'))
  ))
}

function villageQuery(assignedVillages) {
  return assignedVillages.length
    ? {
      $or: assignedVillages.map((location) => ({
        village: new RegExp(`^${location.village.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        ...(location.mandal ? { mandal: new RegExp(`^${location.mandal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } : {}),
        ...(location.district ? { district: new RegExp(`^${location.district.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } : {}),
      })),
    }
    : { _id: { $exists: false } }
}

function isLandingPointSafe(point) {
  const result = Boolean(
    point.verifiedAt
      && Number.isFinite(point.reverifyAt?.getTime())
      && point.reverifyAt.getTime() > Date.now()
      && !point.noFly
      && Object.values(point.checklist.toObject()).every(Boolean),
  )
  return result
}

export async function listLandingPoints(user, filters) {
  let query = filters.includeInactive ? {} : { isActive: true }
  let assignedVillages
  if (user.role === 'chw') {
    const profile = await Chw.findOne({ user: user._id }).select('assignedVillages').lean()
    if (!profile) throw new ApiError(404, 'CHW profile not found.', 'CHW_PROFILE_NOT_FOUND')
    assignedVillages = profile.assignedVillages ?? []
    query = { $and: [query, villageQuery(assignedVillages)] }
  }
  const skip = (filters.page - 1) * filters.limit
  const [items, total] = await Promise.all([
    LandingPoint.aggregate([
      { $match: query },
      { $sort: { village: 1, name: 1 } },
      { $skip: skip },
      { $limit: filters.limit },
      { $set: { photoCount: { $size: { $ifNull: ['$photos', []] } } } },
      { $project: { photos: 0 } },
    ]),
    LandingPoint.countDocuments(query),
  ])
  return {
    items,
    ...(assignedVillages ? { assignedVillages } : {}),
    page: filters.page,
    limit: filters.limit,
    total,
    hasMore: skip + items.length < total,
  }
}

export async function getLandingPoint(user, landingPointId) {
  if (!mongoose.isValidObjectId(landingPointId)) {
    throw new ApiError(404, 'Landing point not found.', 'NOT_FOUND')
  }
  const point = await LandingPoint.findById(landingPointId).lean()
  if (!point) throw new ApiError(404, 'Landing point not found.', 'NOT_FOUND')
  if (user.role === 'chw') {
    const profile = await Chw.findOne({ user: user._id }).select('assignedVillages').lean()
    if (!profile) throw new ApiError(404, 'CHW profile not found.', 'CHW_PROFILE_NOT_FOUND')
    if (!villageMatches(point, profile.assignedVillages ?? [])) {
      throw new ApiError(404, 'Landing point not found.', 'NOT_FOUND')
    }
  }
  return point
}

async function audit(user, action, id, changedFields) {
  await AuditLog.create({
    actor: user._id,
    actorRole: user.role,
    action,
    resourceType: 'LandingPoint',
    resourceId: id,
    changedFields: [...new Set(changedFields)].sort(),
  })
}

export async function createLandingPoint(user, input) {
  let village = input.village
  if (user.role === 'chw') {
    const profile = await Chw.findOne({ user: user._id }).select('assignedVillages').lean()
    if (!profile) throw new ApiError(404, 'CHW profile not found.', 'CHW_PROFILE_NOT_FOUND')
    const assignedVillages = profile.assignedVillages ?? []
    if (!villageMatches(input, assignedVillages)) {
      throw new ApiError(403, 'Landing points can only be submitted for assigned villages.', 'FORBIDDEN')
    }
    const assignment = assignedVillages.find((location) => villageMatches(input, [location]))
    village = assignment.village
    input = {
      ...input,
      mandal: assignment.mandal ?? input.mandal,
      district: assignment.district ?? input.district,
    }
  }
  const point = await LandingPoint.create({
    ...input,
    village,
    submittedBy: user._id,
    isActive: false,
    noFly: false,
  })
  await audit(user, 'landingPoint.create', point._id, Object.keys(input))
  return point.toObject()
}

export async function updateLandingChecklist(user, landingPointId, checklist) {
  if (!mongoose.isValidObjectId(landingPointId)) {
    throw new ApiError(404, 'Landing point not found.', 'NOT_FOUND')
  }
  const profile = await Chw.findOne({ user: user._id }).select('assignedVillages').lean()
  if (!profile) throw new ApiError(404, 'CHW profile not found.', 'CHW_PROFILE_NOT_FOUND')
  const point = await LandingPoint.findById(landingPointId)
  if (!point) throw new ApiError(404, 'Landing point not found.', 'NOT_FOUND')
  if (!villageMatches(point, profile.assignedVillages ?? [])) {
    throw new ApiError(403, 'This landing point is outside your assigned villages.', 'FORBIDDEN')
  }
  if (point.submittedBy?.toString() !== user._id.toString()) {
    throw new ApiError(403, 'Only the CHW who submitted this landing point can update its checklist.', 'FORBIDDEN')
  }
  point.checklist = checklist
  point.isActive = false
  point.verifiedBy = undefined
  point.verifiedAt = undefined
  point.reverifyAt = undefined
  await point.save()
  await audit(user, 'landingPoint.update', point._id, ['checklist', 'isActive', 'verifiedAt', 'reverifyAt'])
  return point.toObject()
}

export async function updateLandingPoint(user, landingPointId, input) {
  if (!mongoose.isValidObjectId(landingPointId)) {
    throw new ApiError(404, 'Landing point not found.', 'NOT_FOUND')
  }
  const point = await LandingPoint.findById(landingPointId)
  if (!point) throw new ApiError(404, 'Landing point not found.', 'NOT_FOUND')
  const fields = { ...input }
  const verificationRequest = fields.verified
  delete fields.verified
  const verificationInvalidated = fields.checklist !== undefined
    || ['location', 'surfaceType', 'obstructionsNotes', 'photos'].some((field) => fields[field] !== undefined)
  point.set(fields)
  if (verificationInvalidated) {
    point.isActive = false
    point.verifiedBy = undefined
    point.verifiedAt = undefined
    point.reverifyAt = undefined
  }
  if (verificationRequest !== undefined) {
    if (verificationRequest) {
      const checklistPassed = Object.values(point.checklist.toObject()).every(Boolean)
      if (!checklistPassed) {
        throw new ApiError(409, 'Complete every landing-site safety checklist item before verification.', 'LANDING_CHECKLIST_INCOMPLETE')
      }
      point.verifiedBy = user._id
      point.verifiedAt = new Date()
      point.reverifyAt = new Date(Date.now() + 183 * 24 * 60 * 60 * 1000)
    } else {
      point.verifiedBy = undefined
      point.verifiedAt = undefined
      point.reverifyAt = undefined
      point.isActive = false
    }
  }
  if (fields.noFly === true) point.isActive = false
  if (fields.noFly === false) point.noFlyReason = undefined
  if (Object.hasOwn(fields, 'isActive') && fields.isActive && !isLandingPointSafe(point)) {
    throw new ApiError(409, 'A landing point must be verified, within its reverification period, and not marked no-fly before activation.', 'LANDING_POINT_UNSAFE')
  }
  if (point.isActive && !isLandingPointSafe(point)) {
    throw new ApiError(409, 'A landing point must be verified, within its reverification period, and not marked no-fly before activation.', 'LANDING_POINT_UNSAFE')
  }
  await point.save()
  await audit(user, 'landingPoint.update', point._id, Object.keys(input))
  return point.toObject()
}

export async function deactivateLandingPoint(user, landingPointId) {
  if (!mongoose.isValidObjectId(landingPointId)) {
    throw new ApiError(404, 'Landing point not found.', 'NOT_FOUND')
  }
  const point = await LandingPoint.findByIdAndUpdate(
    landingPointId,
    { $set: { isActive: false } },
    { new: true, runValidators: true },
  )
  if (!point) throw new ApiError(404, 'Landing point not found.', 'NOT_FOUND')
  await audit(user, 'landingPoint.deactivate', point._id, ['isActive'])
  return point.toObject()
}
