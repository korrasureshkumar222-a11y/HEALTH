import SyncReceipt from '../models/SyncReceipt.js'
import Patient from '../models/Patient.js'
import { isDeepStrictEqual } from 'node:util'
import ApiError from '../utils/ApiError.js'
import { logger } from '../utils/logger.js'
import { canAccessPatient } from './permissions.js'
import { createPatient, updatePatient } from './patientService.js'
import { createReading } from './readingService.js'
import { createSosIncident } from './sosService.js'
import { createChwVisit } from './chwService.js'
import { createReadingSchema } from '../validators/readingValidators.js'
import { createSosSchema } from '../validators/sosValidators.js'
import { patientProfileSchema, updatePatientSchema } from '../validators/patientValidators.js'
import { patientUpdateSyncSchema, syncItemSchema } from '../validators/syncValidators.js'
import { createVisitSchema } from '../validators/chwValidators.js'

const receiptLockMs = 60_000

function parseResult(schema, value) {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new ApiError(400, 'Sync item is invalid.', 'VALIDATION_ERROR', parsed.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })))
  }
  return parsed.data
}

async function reserveReceipt(userId, item) {
  const now = new Date()
  try {
    return { receipt: await SyncReceipt.create({
      user: userId,
      clientId: item.clientId,
      type: item.type,
      status: 'processing',
      clientTimestamp: item.clientTimestamp,
      serverTimestamp: now,
      lockExpiresAt: new Date(now.getTime() + receiptLockMs),
    }) }
  } catch (error) {
    if (error.code !== 11000) throw error
  }

  const existing = await SyncReceipt.findOne({ user: userId, clientId: item.clientId })
  if (!existing) throw new Error('Sync receipt disappeared after a duplicate-key conflict.')
  if (existing.type !== item.type) {
    throw new ApiError(409, 'This client ID was already used for a different sync item.', 'CLIENT_ID_CONFLICT')
  }
  if (existing.status === 'completed') return { existing }
  if (existing.status === 'processing' && existing.lockExpiresAt > now) {
    return { processing: true, serverTimestamp: existing.serverTimestamp }
  }
  const claimed = await SyncReceipt.findOneAndUpdate(
    { _id: existing._id, status: { $in: ['retryable', 'processing'] }, lockExpiresAt: { $lte: now } },
    { $set: { status: 'processing', serverTimestamp: now, lockExpiresAt: new Date(now.getTime() + receiptLockMs) } },
    { new: true },
  )
  return claimed ? { receipt: claimed } : { processing: true, serverTimestamp: existing.serverTimestamp }
}

async function runSyncItem(user, item) {
  if (item.type === 'reading') {
    const input = parseResult(createReadingSchema, { ...item.payload, clientId: item.clientId })
    const result = await createReading(user, input)
    return {
      outcome: result.duplicate ? 'duplicate' : 'accepted',
      recordId: result.record._id.toString(),
      status: result.record.status,
      data: { record: result.record.toJSON?.() ?? result.record },
    }
  }

  if (item.type === 'sos') {
    const input = parseResult(createSosSchema, { ...item.payload, clientId: item.clientId })
    const result = await createSosIncident(user, input, input.patientId)
    return {
      outcome: result.duplicate ? 'duplicate' : 'accepted',
      recordId: result.incident._id.toString(),
      data: result,
    }
  }

  if (item.type === 'visit.create') {
    const input = parseResult(createVisitSchema, { ...item.payload, clientId: item.clientId })
    const result = await createChwVisit(user, input)
    return {
      outcome: result.duplicate ? 'duplicate' : 'accepted',
      recordId: result.visit._id.toString(),
      data: { visit: result.visit },
    }
  }

  if (item.type === 'patient.create') {
    if (!['chw', 'admin'].includes(user.role)) {
      throw new ApiError(403, 'You are not allowed to register patients.', 'FORBIDDEN')
    }
    const input = parseResult(patientProfileSchema, { ...item.payload, clientId: item.clientId })
    const existing = await Patient.findOne({ clientId: item.clientId }).lean()
    if (existing) {
      if (existing.phone !== input.phone) {
        throw new ApiError(409, 'This client ID belongs to a different patient profile.', 'CLIENT_ID_CONFLICT')
      }
      return { outcome: 'duplicate', recordId: existing._id.toString(), data: { patient: existing } }
    }
    const patient = await createPatient(user, input)
    return { outcome: 'accepted', recordId: patient._id.toString(), data: { patient } }
  }

  const input = parseResult(patientUpdateSyncSchema, item.payload)
  if (!await canAccessPatient(user, input.patientId)) {
    throw new ApiError(403, 'You are not allowed to update this patient.', 'FORBIDDEN')
  }
  const changes = parseResult(updatePatientSchema, input.changes)
  const current = await Patient.findById(input.patientId).lean()
  if (!current) throw new ApiError(404, 'Patient not found.', 'NOT_FOUND')
  if (Object.entries(changes).every(([key, value]) => isDeepStrictEqual(current[key], value))) {
    return { outcome: 'duplicate', recordId: input.patientId, data: { patient: current } }
  }
  if (item.clientTimestamp && current.updatedAt > item.clientTimestamp) {
    return {
      outcome: 'conflict',
      recordId: input.patientId,
      error: { code: 'SERVER_WINS_CONFLICT', message: 'A newer patient profile exists on the server.' },
      data: { serverTimestamp: current.updatedAt },
    }
  }
  const patient = await updatePatient(user, input.patientId, changes)
  return { outcome: 'accepted', recordId: patient._id.toString(), data: { patient } }
}

async function processItem(user, rawItem) {
  const parsedItem = syncItemSchema.safeParse(rawItem)
  if (!parsedItem.success) {
    return {
      ...(typeof rawItem?.clientId === 'string' ? { clientId: rawItem.clientId } : {}),
      ...(typeof rawItem?.type === 'string' ? { type: rawItem.type } : {}),
      outcome: 'rejected',
      serverTimestamp: new Date(),
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Sync item is invalid.',
        details: parsedItem.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    }
  }
  const item = parsedItem.data

  let reservation
  try {
    reservation = await reserveReceipt(user._id, item)
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        clientId: item.clientId,
        type: item.type,
        outcome: 'rejected',
        serverTimestamp: new Date(),
        error: { code: error.code, message: error.message },
      }
    }
    throw error
  }

  if (reservation.existing) {
    return {
      ...reservation.existing.result,
      outcome: reservation.existing.result?.outcome === 'accepted' ? 'duplicate' : reservation.existing.result?.outcome,
      clientId: item.clientId,
      type: item.type,
      serverTimestamp: reservation.existing.serverTimestamp,
    }
  }
  if (reservation.processing) {
    return {
      clientId: item.clientId,
      type: item.type,
      outcome: 'retry',
      retryable: true,
      serverTimestamp: reservation.serverTimestamp,
      error: { code: 'SYNC_IN_PROGRESS', message: 'This item is already being processed.' },
    }
  }

  const receipt = reservation.receipt
  try {
    const result = await runSyncItem(user, item)
    const response = {
      clientId: item.clientId,
      type: item.type,
      ...result,
      serverTimestamp: receipt.serverTimestamp,
    }
    await SyncReceipt.updateOne(
      { _id: receipt._id, status: 'processing' },
      { $set: { status: 'completed', result: response }, $unset: { lockExpiresAt: 1 } },
    )
    return response
  } catch (error) {
    const retryable = !(error instanceof ApiError) || error.statusCode >= 500
    const response = {
      clientId: item.clientId,
      type: item.type,
      outcome: retryable ? 'retry' : 'rejected',
      retryable,
      serverTimestamp: receipt.serverTimestamp,
      error: { code: error.code ?? 'SYNC_FAILED', message: error.message },
    }
    if (error instanceof ApiError && error.details) response.error.details = error.details
    if (!(error instanceof ApiError)) {
      logger.error({
        event: 'sync.item_failed',
        userId: user._id.toString(),
        clientId: item.clientId,
        type: item.type,
        name: error.name,
      }, 'Unexpected error processing offline sync item.')
    }
    await SyncReceipt.updateOne(
      { _id: receipt._id, status: 'processing' },
      retryable
        ? { $set: { status: 'retryable', result: response, lockExpiresAt: new Date(Date.now() + 1000) } }
        : { $set: { status: 'completed', result: response }, $unset: { lockExpiresAt: 1 } },
    )
    return response
  }
}

export async function syncItems(user, items) {
  const results = []
  for (const item of items) {
    results.push(await processItem(user, item))
  }
  return { results }
}
