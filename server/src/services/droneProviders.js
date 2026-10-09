import { env } from '../config/env.js'
import ApiError from '../utils/ApiError.js'

export class DroneProvider {
  async dispatch(_mission) {
    throw new Error('DroneProvider.dispatch must be implemented.')
  }

  async abort(_mission, _reason) {
    throw new Error('DroneProvider.abort must be implemented.')
  }
}

export class MockDroneProvider extends DroneProvider {
  async dispatch(mission) {
    return {
      providerMissionId: `mock-${mission._id}`,
      simulation: true,
    }
  }

  async abort(mission) {
    return { providerMissionId: mission.providerMissionId, simulation: true }
  }
}

export class HttpDroneProvider extends DroneProvider {
  constructor({ baseUrl = env.droneApiUrl, token = env.droneApiToken } = {}) {
    super()
    if (!baseUrl || !token) {
      throw new ApiError(503, 'HTTP drone provider is not configured.', 'DRONE_PROVIDER_NOT_CONFIGURED')
    }
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.token = token
  }

  async send(path, body) {
    let response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw new ApiError(502, 'Could not reach the configured drone provider.', 'DRONE_PROVIDER_UNAVAILABLE')
    }
    if (!response.ok) {
      throw new ApiError(502, `Drone provider returned HTTP ${response.status}.`, 'DRONE_PROVIDER_FAILED')
    }
    return response.json()
  }

  async dispatch(mission) {
    const result = await this.send('/missions', {
      idempotencyKey: mission._id.toString(),
      missionId: mission._id.toString(),
      originHealthCentreId: mission.originHealthCentre.toString(),
      landingPointId: mission.landingPoint.toString(),
      payload: mission.payload,
      eta: mission.eta,
    })
    if (typeof result.providerMissionId !== 'string' || !result.providerMissionId) {
      throw new ApiError(502, 'Drone provider returned an invalid mission response.', 'DRONE_PROVIDER_INVALID_RESPONSE')
    }
    return { providerMissionId: result.providerMissionId, simulation: false }
  }

  async abort(mission, reason) {
    await this.send(`/missions/${encodeURIComponent(mission.providerMissionId)}/abort`, {
      idempotencyKey: `${mission._id}:abort`,
      reason,
    })
    return { providerMissionId: mission.providerMissionId, simulation: false }
  }
}

export class WeatherProvider {
  async checkFlightConditions(_route) {
    throw new Error('WeatherProvider.checkFlightConditions must be implemented.')
  }
}

export class MockWeatherProvider extends WeatherProvider {
  async checkFlightConditions() {
    return { safe: true, provider: 'mock-weather', checkedAt: new Date() }
  }
}

export class SmsProvider {
  async send(_recipient, _body) {
    throw new Error('SmsProvider.send must be implemented.')
  }
}

export class MockSmsProvider extends SmsProvider {
  async send(recipient, body) {
    return {
      provider: 'mock',
      status: 'simulated',
      providerMessageId: `mock-sms-${Date.now()}-${recipient.slice(-4)}`,
      body,
    }
  }
}

export class HttpSmsProvider extends SmsProvider {
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

export function createDroneProvider() {
  return env.droneProvider === 'http' ? new HttpDroneProvider() : new MockDroneProvider()
}

export function createWeatherProvider() {
  return new MockWeatherProvider()
}

export function createSmsProvider() {
  return env.smsProvider === 'http' ? new HttpSmsProvider() : new MockSmsProvider()
}
