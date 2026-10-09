import mongoose from 'mongoose'
import { env } from './env.js'
import { logger } from '../utils/logger.js'

let connectionEventsRegistered = false

function registerConnectionEvents() {
  if (connectionEventsRegistered) return
  connectionEventsRegistered = true

  mongoose.connection.on('connected', () => {
    logger.info({ event: 'mongo.connected' }, 'MongoDB connection established.')
  })
  mongoose.connection.on('reconnected', () => {
    logger.info({ event: 'mongo.reconnected' }, 'MongoDB connection restored.')
  })
  mongoose.connection.on('disconnected', () => {
    logger.warn({ event: 'mongo.disconnected' }, 'MongoDB connection lost; Mongoose will attempt reconnection.')
  })
  mongoose.connection.on('error', (error) => {
    logger.error({
      event: 'mongo.error',
      name: error.name,
      code: error.code,
    }, 'MongoDB connection error.')
  })
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * Connects one shared Mongoose client, retrying initial startup failures with
 * capped exponential backoff. Pool and driver timeouts retain driver defaults
 * until workload and deployment measurements justify tuning them.
 */
export async function connectMongo(uri = env.mongoUri) {
  if (!uri) {
    throw new Error('MONGO_URI is required before starting the API.')
  }

  registerConnectionEvents()
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection
  }

  let lastError
  for (let attempt = 1; attempt <= env.dbConnectMaxRetries; attempt += 1) {
    try {
      await mongoose.connect(uri)
      return mongoose.connection
    } catch (error) {
      lastError = error
      logger.error({
        event: 'mongo.connect_attempt_failed',
        attempt,
        maxAttempts: env.dbConnectMaxRetries,
        name: error.name,
        code: error.code,
      }, 'MongoDB initial connection attempt failed.')

      if (attempt < env.dbConnectMaxRetries) {
        const backoffMs = Math.min(
          env.dbRetryBaseDelayMs * (2 ** (attempt - 1)),
          30000,
        )
        await delay(backoffMs)
      }
    }
  }

  throw new Error(
    `Unable to connect to MongoDB after ${env.dbConnectMaxRetries} attempts.`,
    { cause: lastError },
  )
}

export async function disconnectMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
    logger.info({ event: 'mongo.closed' }, 'MongoDB connection closed.')
  }
}

export default connectMongo
