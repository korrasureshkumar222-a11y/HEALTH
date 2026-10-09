import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'
import SmsLog from '../models/SmsLog.js'
import { smsOtpTemplate } from '../utils/smsTemplates.js'
import { createSmsProvider } from './smsProviders.js'

let provider = createSmsProvider()

export function configureSmsProvider(nextProvider) {
  provider = nextProvider
}

function hashSecret() {
  const secret = env.smsLogHashSecret ?? env.jwtAccessSecret ?? env.jwtRefreshSecret
  if (!secret) throw new Error('SMS_LOG_HASH_SECRET or a JWT secret must be configured to hash phone numbers.')
  return secret
}

export function hashSmsPhone(phone) {
  if (typeof phone !== 'string' || !phone) throw new TypeError('A phone number is required for SMS logging.')
  return createHmac('sha256', hashSecret()).update(phone).digest('hex')
}

export function normalizeSmsPhone(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`
  if (trimmed.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`
  return null
}

export function redactSmsBody(body) {
  if (typeof body !== 'string') return '[message body unavailable]'
  return body
    .replace(/\b\d{2,4}\b/g, '[value]')
    .slice(0, 2000)
}

export function verifyTwilioSignature({ url, parameters, signature, authToken = env.twilioAuthToken }) {
  if (!url || !authToken || typeof signature !== 'string') return false
  const canonical = Object.keys(parameters ?? {})
    .sort()
    .reduce((value, key) => {
      const values = Array.isArray(parameters[key]) ? parameters[key] : [parameters[key]]
      return value + key + values.map((entry) => String(entry ?? '')).join('')
    }, url)
  const expected = createHmac('sha1', authToken).update(canonical).digest('base64')
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(signature)
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer)
}

export async function logSmsAttempt({
  direction = 'outbound',
  to,
  from,
  body,
  bodyRedacted = redactSmsBody(body),
  messageType,
  purpose,
  status,
  provider: providerName = env.smsProvider,
  providerMessageId,
  patient,
  user,
  droneMission,
  appointment,
  dedupeKey,
  signatureValid,
  parsedPayload,
  failureCode,
  receivedAt,
  processedAt,
}) {
  const entry = {
    direction,
    toPhoneHash: to ? hashSmsPhone(to) : undefined,
    fromPhoneHash: from ? hashSmsPhone(from) : undefined,
    bodyRedacted: String(bodyRedacted ?? '[message body unavailable]').slice(0, 2000),
    messageType,
    purpose,
    status,
    provider: providerName,
    providerMessageId,
    patient,
    user,
    droneMission,
    appointment,
    dedupeKey,
    signatureValid,
    parsedPayload,
    failureCode,
    receivedAt,
    processedAt,
  }
  Object.keys(entry).forEach((key) => entry[key] === undefined && delete entry[key])
  return SmsLog.create(entry)
}

export async function sendSms({
  to,
  body,
  language = 'en',
  messageType,
  purpose,
  patient,
  user,
  droneMission,
  appointment,
  dedupeKey,
  bodyRedacted,
  smsProvider = provider,
}) {
  const recipient = normalizeSmsPhone(to)
  if (!recipient) throw new TypeError('A valid SMS recipient phone number is required.')
  const existing = dedupeKey ? await SmsLog.findOne({ dedupeKey }).lean() : null
  if (existing && existing.status !== 'failed') {
    return { status: existing.status, duplicate: true, logId: existing._id }
  }

  let log
  try {
    log = await logSmsAttempt({
      direction: 'outbound',
      to: recipient,
      body,
      bodyRedacted: bodyRedacted ?? redactSmsBody(body),
      messageType,
      purpose,
      status: 'queued',
      provider: smsProvider.providerName
        ?? (smsProvider.constructor.name === 'MockSmsProvider' ? 'mock' : env.smsProvider),
      patient,
      user,
      droneMission,
      appointment,
      dedupeKey,
    })
  } catch (error) {
    if (error.code !== 11000 || !dedupeKey) throw error
    const duplicate = await SmsLog.findOne({ dedupeKey }).lean()
    if (duplicate && duplicate.status !== 'failed') {
      return { status: duplicate.status, duplicate: true, logId: duplicate._id }
    }
    throw error
  }

  try {
    const result = await smsProvider.send(recipient, body)
    log.status = result.status
    log.provider = result.provider
    log.providerMessageId = result.providerMessageId
    await log.save()
    return { status: result.status, provider: result.provider, providerMessageId: result.providerMessageId, logId: log._id }
  } catch (error) {
    log.status = 'failed'
    log.failureCode = error.code ?? 'SMS_SEND_FAILED'
    await log.save()
    return { status: 'failed', code: log.failureCode, logId: log._id }
  }
}

export async function sendOtpSms({ to, code, language = 'en', user }) {
  return sendSms({
    to,
    body: smsOtpTemplate(code, language),
    language,
    messageType: 'otp',
    purpose: 'otp',
    user,
    bodyRedacted: '[verification code redacted]',
  })
}
