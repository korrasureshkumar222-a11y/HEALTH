import { randomUUID } from 'node:crypto'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import pinoHttp from 'pino-http'
import mongoSanitize from 'express-mongo-sanitize'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import hpp from 'hpp'
import * as Sentry from '@sentry/node'
import xss from 'xss'
import { env } from './config/env.js'
import { logger } from './utils/logger.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import authRoutes from './routes/authRoutes.js'
import alertRoutes from './routes/alertRoutes.js'
import dashboardRoutes from './routes/dashboardRoutes.js'
import sosRoutes from './routes/sosRoutes.js'
import healthRoutes from './routes/healthRoutes.js'
import patientRoutes from './routes/patientRoutes.js'
import syncRoutes from './routes/syncRoutes.js'
import chwRoutes from './routes/chwRoutes.js'
import healthCentreRoutes from './routes/healthCentreRoutes.js'
import droneRoutes from './routes/droneRoutes.js'
import smsRoutes from './routes/smsRoutes.js'
import appointmentRoutes from './routes/appointmentRoutes.js'
import reportRoutes from './routes/reportRoutes.js'
import ApiError from './utils/ApiError.js'
import validateRequest from './middleware/validateRequest.js'
import { emptyParamsSchema, emptyQuerySchema } from './validators/securityValidators.js'

const app = express()

if (env.sentryDsn) {
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.nodeEnv,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  })
}

if (env.trustProxy > 0) {
  app.set('trust proxy', env.trustProxy)
}

app.disable('x-powered-by')
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      upgradeInsecureRequests: env.nodeEnv === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}))
app.use((request, response, next) => {
  if (env.nodeEnv !== 'production' || request.secure) {
    next()
    return
  }
  response.redirect(308, new URL(request.originalUrl, env.corsOrigins[0]).toString())
})
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin) {
      callback(null, false)
      return
    }
    if (env.corsOrigins.includes(origin)) {
      callback(null, true)
      return
    }
    callback(new ApiError(403, 'Origin is not allowed.', 'CORS_ORIGIN_DENIED'))
  },
}))
app.use((request, response, next) => {
  request.requestId = randomUUID()
  response.setHeader('X-Request-Id', request.requestId)
  next()
})
app.use(express.json({ limit: '300kb', strict: true, type: ['application/json', 'application/*+json'] }))
app.use(express.urlencoded({ extended: false, limit: '50kb', parameterLimit: 100 }))
app.use(cookieParser())
app.use((request, response, next) => {
  if (request.path === '/api/sms/inbound') {
    next()
    return
  }
  mongoSanitize()(request, response, next)
})
app.use(hpp())
app.use((request, _response, next) => {
  if (request.path === '/api/sms/inbound') {
    next()
    return
  }
  const sanitize = (value) => {
    if (typeof value === 'string') {
      return xss(value, { whiteList: {}, stripIgnoreTag: true, stripIgnoreTagBody: ['script', 'style'] })
    }
    if (Array.isArray(value)) return value.map(sanitize)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitize(entry)]))
    }
    return value
  }
  for (const source of ['body', 'query', 'params']) {
    if (request[source] && typeof request[source] === 'object') request[source] = sanitize(request[source])
  }
  next()
})

app.use(pinoHttp({
  logger,
  genReqId: (request) => request.requestId,
  serializers: {
    req: (request) => ({
      id: request.id,
      method: request.method,
      path: request.url.split('?')[0],
    }),
    res: (response) => ({ statusCode: response.statusCode }),
  },
  customProps: (request) => ({ requestId: request.requestId }),
  autoLogging: env.nodeEnv !== 'test',
}))

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
    error: { code: 'RATE_LIMITED' },
  },
}))

app.get('/', validateRequest(emptyParamsSchema, 'params'), validateRequest(emptyQuerySchema, 'query'), (_request, response) => {
  response.status(200).json({
    success: true,
    message: 'Chronic Disease Remote Monitoring API',
    data: { healthPath: '/api/health' },
  })
})
app.use('/api/health', healthRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/alerts', alertRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/sos', sosRoutes)
app.use('/api/sync', syncRoutes)
app.use('/api/chw', chwRoutes)
app.use('/api/health-centres', healthCentreRoutes)
app.use('/api/drone', droneRoutes)
app.use('/api/sms', smsRoutes)
app.use('/api/appointments', appointmentRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api', patientRoutes)

app.use(notFoundHandler)
app.use(errorHandler)

export default app
