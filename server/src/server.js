import http from 'node:http'
import app from './app.js'
import { connectMongo, disconnectMongo } from './config/db.js'
import { env } from './config/env.js'
import { startAlertJobs, stopAlertJobs } from './jobs/alertJobs.js'
import { logger } from './utils/logger.js'

const server = http.createServer(app)
let isShuttingDown = false
let startupPromise

async function startServer() {
  try {
    await connectMongo()
    if (isShuttingDown) return
    startAlertJobs()

    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(env.port, () => {
        server.removeListener('error', reject)
        logger.info({ event: 'server.listening', port: env.port, environment: env.nodeEnv }, 'API server listening.')
        resolve()
      })
    })
  } catch (error) {
    logger.fatal({
      event: 'server.startup_failed',
      message: error.message,
      cause: error.cause?.name,
    }, 'API server failed to start.')
    process.exitCode = 1
    await disconnectMongo()
  }
}

function shutdown(signal) {
  if (isShuttingDown) return
  isShuttingDown = true
  stopAlertJobs()

  logger.info({ event: 'server.shutdown_started', signal }, 'Closing HTTP server and MongoDB connection.')
  const closeDatabase = async () => {
    try {
      await disconnectMongo()
    } catch (error) {
      logger.error({
        event: 'mongo.shutdown_failed',
        name: error.name,
        code: error.code,
      }, 'Failed to close MongoDB cleanly.')
      process.exitCode = 1
    }
  }

  const timeout = setTimeout(() => {
    logger.fatal({ event: 'server.shutdown_timeout' }, 'Graceful shutdown timed out; forcing process exit.')
    process.exit(1)
  }, 10000)
  timeout.unref()

  void (async () => {
    if (!server.listening) {
      await startupPromise?.catch(() => {})
      await closeDatabase()
      return
    }

    server.close(async (error) => {
      if (error) {
        logger.error({ event: 'server.http_shutdown_failed', err: error }, 'Failed to close HTTP server cleanly.')
        process.exitCode = 1
      }
      await closeDatabase()
    })
  })()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

startupPromise = startServer()
