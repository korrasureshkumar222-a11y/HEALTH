import request from 'supertest'
import app from '../src/app.js'

describe('health endpoint', () => {
  test('returns the standard success envelope', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect('Content-Type', /json/)
      .expect(200)

    expect(response.body).toEqual({
      success: true,
      message: 'Service is healthy.',
      data: {
        status: 'ok',
        timestamp: expect.any(String),
        uptimeSeconds: expect.any(Number),
      },
    })
    expect(response.headers['x-request-id']).toBeDefined()
  })

  test('returns a standard not-found error envelope', async () => {
    const response = await request(app)
      .get('/api/not-a-route')
      .expect(404)

    expect(response.body).toEqual({
      success: false,
      message: 'Route not found: GET /api/not-a-route',
      error: { code: 'NOT_FOUND' },
    })
  })

  test('returns a client error for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"invalid":')
      .expect(400)

    expect(response.body).toEqual({
      success: false,
      message: 'Request body contains invalid JSON.',
      error: { code: 'INVALID_JSON' },
    })
  })
})
