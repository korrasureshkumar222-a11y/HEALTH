import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import User from '../src/models/User.js'

let mongo

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await User.init()
})

afterEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

test('authenticated users can update their profile language', async () => {
  await User.create({
    name: 'Language Test',
    phone: '9876543210',
    passwordHash: 'test-password-123',
    role: 'patient',
  })
  const session = await request(app)
    .post('/api/auth/login')
    .send({ phone: '9876543210', password: 'test-password-123' })
    .expect(200)

  const response = await request(app)
    .patch('/api/auth/language')
    .set('Authorization', `Bearer ${session.body.data.accessToken}`)
    .send({ language: 'te' })
    .expect(200)

  expect(response.body.data.user.language).toBe('te')
  expect((await User.findOne({ phone: '9876543210' })).language).toBe('te')
})
