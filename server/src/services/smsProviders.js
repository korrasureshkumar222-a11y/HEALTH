import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'
import ApiError from '../utils/ApiError.js'

export class SmsProvider {
  providerName = 'unknown'

  async send(_recipient, _body) {
    throw new Error('SmsProvider.send must be implemented.')
  }
}

export class MockSmsProvider extends SmsProvider {
  providerName = 'mock'

  async send(recipient, body) {
    return {
      provider: 'mock',
      status: 'simulated',
      providerMessageId: `mock-sms-${randomUUID()}-${recipient.slice(-4)}`,
      body,
    }
  }
}

export class HttpSmsProvider extends SmsProvider {
  providerName = 'http'

  constructor({ url = env.smsApiUrl, token = env.smsApiToken } = {}) {
    super()
    if (!url || !token) {
      throw new ApiError(503, 'HTTP SMS provider is not configured.', 'SMS_PROVIDER_NOT_CONFIGURED')
    }
    this.url = url
    this.token = token
  }

  async send(recipient, body) {
    let response
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to: recipient, body }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw new ApiError(502, 'Could not reach the configured SMS provider.', 'SMS_PROVIDER_UNAVAILABLE')
    }
    if (!response.ok) {
      throw new ApiError(502, `SMS provider returned HTTP ${response.status}.`, 'SMS_PROVIDER_FAILED')
    }
    const result = await response.json()
    return {
      provider: 'http',
      status: 'sent',
      providerMessageId: result.providerMessageId,
      body,
    }
  }
}

export class TwilioSmsProvider extends SmsProvider {
  providerName = 'twilio'

  constructor({
    accountSid = env.twilioAccountSid,
    authToken = env.twilioAuthToken,
    fromNumber = env.twilioFromNumber,
  } = {}) {
    super()
    if (!accountSid || !authToken || !fromNumber) {
      throw new ApiError(503, 'Twilio SMS is not configured.', 'SMS_PROVIDER_NOT_CONFIGURED')
    }
    this.accountSid = accountSid
    this.authToken = authToken
    this.fromNumber = fromNumber
  }

  async send(recipient, body) {
    const parameters = new URLSearchParams({
      To: recipient,
      From: this.fromNumber,
      Body: body,
    })
    let response
    try {
      response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
          body: parameters,
          signal: AbortSignal.timeout(10_000),
        },
      )
    } catch {
      throw new ApiError(502, 'Could not reach Twilio.', 'SMS_PROVIDER_UNAVAILABLE')
    }
    if (!response.ok) {
      throw new ApiError(502, `Twilio returned HTTP ${response.status}.`, 'SMS_PROVIDER_FAILED')
    }
    const result = await response.json()
    if (typeof result.sid !== 'string' || !result.sid) {
      throw new ApiError(502, 'Twilio returned an invalid message response.', 'SMS_PROVIDER_INVALID_RESPONSE')
    }
    return { provider: 'twilio', status: 'sent', providerMessageId: result.sid, body }
  }
}

export function createSmsProvider() {
  if (env.smsProvider === 'twilio') return new TwilioSmsProvider()
  if (env.smsProvider === 'http') return new HttpSmsProvider()
  return new MockSmsProvider()
}
