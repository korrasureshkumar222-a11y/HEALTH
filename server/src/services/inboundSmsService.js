import ApiError from '../utils/ApiError.js'
import { env } from '../config/env.js'
import SmsLog from '../models/SmsLog.js'
import SmsRateLimit from '../models/SmsRateLimit.js'
import Patient from '../models/Patient.js'
import { createSmsReading } from './readingService.js'
import { createSmsSosIncident } from './sosService.js'
import {
  hashSmsPhone,
  logSmsAttempt,
  normalizeSmsPhone,
  redactSmsBody,
  sendSms,
  verifyTwilioSignature,
} from './smsService.js'
import { parseSmsCommand } from './smsParser.js'
import {
  smsCommandError,
  smsNoLocationReply,
  smsPatientUnknownReply,
  smsRateLimitReply,
  smsReadingConfirmation,
  smsSosReply,
  smsStatusReply,
} from '../utils/smsTemplates.js'

async function consumeRateLimit(phoneHash, now = new Date()) {
  const windowMs = 60_000 * env.smsInboundRateWindowMinutes
  const windowStart = new Date(now.getTime() - (now.getTime() % windowMs))
  const cutoff = new Date(windowStart.getTime())
  const rateLimit = await SmsRateLimit.findOneAndUpdate(
    { phoneHash },
    [{
      $set: {
        count: {
          $cond: [
            { $gte: [{ $ifNull: ['$windowStart', new Date(0)] }, cutoff] },
            { $add: [{ $ifNull: ['$count', 0] }, 1] },
            1,
          ],
        },
        windowStart: {
          $cond: [
            { $gte: [{ $ifNull: ['$windowStart', new Date(0)] }, cutoff] },
            '$windowStart',
            windowStart,
          ],
        },
        expiresAt: new Date(windowStart.getTime() + windowMs * 2),
      },
    }],
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )
  return rateLimit.count
}

function languageFor(patient) {
  const language = patient?.user?.language ?? patient?.language ?? 'en'
  return language === 'te' ? 'te' : 'en'
}

async function findPatientByPhone(phone) {
  const nationalNumber = phone.slice(-10)
  const patient = await Patient.findOne({ phone: nationalNumber, status: 'active' })
    .populate('user', 'name phone language isActive')
    .lean()
  if (patient?.user && !patient.user.isActive) return null
  return patient
}

async function reply(to, body, { patient, language, type = 'unknown', purpose = 'inbound_unknown', sid } = {}) {
  if (!to) return { status: 'not_sent' }
  return sendSms({
    to,
    body,
    language,
    messageType: type,
    purpose,
    patient: patient?._id,
    user: patient?.user?._id,
    dedupeKey: sid ? `inbound-reply:${sid}` : undefined,
    bodyRedacted: redactSmsBody(body),
  })
}

export async function receiveInboundSms({ url, signature, parameters }) {
  const sender = normalizeSmsPhone(parameters?.From)
  const body = typeof parameters?.Body === 'string' ? parameters.Body.trim() : ''
  const messageSid = typeof parameters?.MessageSid === 'string' ? parameters.MessageSid : undefined
  const signatureValid = verifyTwilioSignature({ url, parameters, signature })

  if (!signatureValid) {
    if (sender) {
      await logSmsAttempt({
        direction: 'inbound',
        from: sender,
        bodyRedacted: redactSmsBody(body),
        messageType: 'unknown',
        purpose: 'inbound_unknown',
        status: 'rejected',
        provider: 'twilio',
        signatureValid: false,
        receivedAt: new Date(),
        failureCode: 'INVALID_SIGNATURE',
      })
    }
    throw new ApiError(403, 'SMS provider signature is invalid.', 'SMS_SIGNATURE_INVALID')
  }
  if (!sender) {
    throw new ApiError(400, 'A valid sender number is required.', 'SMS_SENDER_INVALID')
  }

  if (messageSid) {
    const existing = await SmsLog.findOne({
      direction: 'inbound',
      provider: 'twilio',
      providerMessageId: messageSid,
    }).lean()
    if (existing) return { duplicate: true, reply: null, status: existing.status }
  }

  const phoneHash = hashSmsPhone(sender)
  const count = await consumeRateLimit(phoneHash)
  if (count > env.smsInboundRateLimit) {
    await logSmsAttempt({
      direction: 'inbound',
      from: sender,
      bodyRedacted: redactSmsBody(body),
      messageType: 'unknown',
      purpose: 'inbound_unknown',
      status: 'rate_limited',
      provider: 'twilio',
      providerMessageId: messageSid,
      signatureValid: true,
      receivedAt: new Date(),
      failureCode: 'SMS_RATE_LIMITED',
    })
    const patient = await findPatientByPhone(sender)
    const language = languageFor(patient)
    await reply(sender, smsRateLimitReply(language), { patient, language, sid: messageSid })
    return { duplicate: false, rateLimited: true, reply: smsRateLimitReply(language) }
  }

  const receivedAt = new Date()
  let log
  try {
    log = await SmsLog.create({
      direction: 'inbound',
      fromPhoneHash: phoneHash,
      bodyRedacted: redactSmsBody(body),
      messageType: 'unknown',
      purpose: 'inbound_unknown',
      status: 'processing',
      provider: 'twilio',
      providerMessageId: messageSid,
      signatureValid: true,
      receivedAt,
    })
  } catch (error) {
    if (error.code !== 11000 || !messageSid) throw error
    const duplicate = await SmsLog.findOne({ provider: 'twilio', providerMessageId: messageSid }).lean()
    if (duplicate) return { duplicate: true, reply: null, status: duplicate.status }
    throw error
  }

  let patient
  let language = 'en'
  let replyBody
  let purpose = 'inbound_unknown'
  let messageType = 'unknown'
  let parsedPayload
  let finalStatus = 'rejected'
  try {
    const command = parseSmsCommand(body)
    patient = await findPatientByPhone(sender)
    language = languageFor(patient)
    if (!patient) {
      replyBody = smsPatientUnknownReply(language)
    } else if (!command.success) {
      replyBody = smsCommandError(command.code, language)
    } else if (command.kind === 'sos') {
      purpose = 'inbound_sos'
      messageType = 'sos'
      try {
        const result = await createSmsSosIncident(patient)
        replyBody = smsSosReply(language)
        parsedPayload = { kind: 'sos', incidentId: result.incident._id.toString() }
        finalStatus = 'accepted'
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'SOS_LOCATION_REQUIRED') throw error
        replyBody = smsNoLocationReply(language)
        parsedPayload = { kind: 'sos', outcome: 'location_required' }
      }
    } else {
      purpose = 'inbound_reading'
      messageType = 'reading'
      const { record } = await createSmsReading(patient, command)
      replyBody = smsReadingConfirmation(command, record.status, language)
      if (['warning', 'critical'].includes(record.status)) {
        replyBody += ` ${smsStatusReply(record.status, language)}`
      }
      parsedPayload = {
        kind: 'reading',
        type: command.type,
        status: record.status,
        recordId: record._id.toString(),
      }
      finalStatus = 'accepted'
    }
    log.patient = patient?._id
    log.user = patient?.user?._id
    log.messageType = messageType
    log.purpose = purpose
    log.status = finalStatus
    log.parsedPayload = parsedPayload
    log.processedAt = new Date()
    await log.save()
    await reply(sender, replyBody, { patient, language, type: messageType, purpose, sid: messageSid })
    return { duplicate: false, reply: replyBody, status: finalStatus }
  } catch (error) {
    log.status = 'failed'
    log.failureCode = error.code ?? 'SMS_PROCESSING_FAILED'
    log.processedAt = new Date()
    await log.save()
    throw error
  }
}

export { consumeRateLimit }
