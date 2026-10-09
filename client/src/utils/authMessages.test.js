import { describe, expect, it } from 'vitest'
import { getAuthErrorMessage } from './authMessages.js'

describe('getAuthErrorMessage', () => {
  it('explains when registration is rate limited', () => {
    const translate = (key) => key

    expect(getAuthErrorMessage({
      response: { data: { error: { code: 'REGISTER_RATE_LIMITED' } } },
    }, translate, 'registrationFailed')).toBe('registrationRateLimited')
  })
})
