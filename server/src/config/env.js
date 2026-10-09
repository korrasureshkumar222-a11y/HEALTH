import 'dotenv/config'
import { z } from 'zod'

const optionalUrl = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.string().url().optional(),
)

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  PII_ENCRYPTION_KEY: z.string().optional(),
  MONGO_URI: z.string().optional(),
  DB_CONNECT_MAX_RETRIES: z.coerce.number().int().min(1).max(20).default(5),
  DB_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(100).max(30000).default(1000),
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  AUTH_LOCK_DURATION_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  AUTH_BCRYPT_ROUNDS: z.coerce.number().int().min(12).max(15).default(12),
  AUTH_LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  AUTH_REGISTER_RATE_LIMIT: z.coerce.number().int().min(1).max(100).default(5),
  SMS_WEBHOOK_RATE_LIMIT: z.coerce.number().int().min(1).max(100).default(20),
  READING_RULESET_VERSION: z.string().trim().min(1).max(80).default('demo-v1'),
  READING_THRESHOLDS_JSON: z.string().optional(),
  ALERT_DEDUPE_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  ALERT_ESCALATION_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SENTRY_DSN: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.string().url().optional(),
  ),
  DRONE_PROVIDER: z.enum(['mock', 'http']).default('mock'),
  DRONE_API_URL: optionalUrl,
  DRONE_API_TOKEN: z.string().optional(),
  DRONE_CRUISE_SPEED_KMH: z.coerce.number().positive().max(200).default(40),
  DRONE_PREP_MINUTES: z.coerce.number().int().min(1).max(120).default(10),
  SMS_PROVIDER: z.enum(['mock', 'http', 'twilio']).default('mock'),
  SMS_API_URL: optionalUrl,
  SMS_API_TOKEN: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  SMS_WEBHOOK_URL: z.string().url().optional(),
  SMS_LOG_HASH_SECRET: z.string().min(32).optional(),
  SMS_INBOUND_RATE_LIMIT: z.coerce.number().int().min(1).max(100).default(5),
  SMS_INBOUND_RATE_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
}).superRefine((env, context) => {
  const corsOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  if (corsOrigins.some((origin) => origin === '*' || !/^https?:\/\/[^/]+$/.test(origin))) {
    context.addIssue({
      code: 'custom',
      path: ['CORS_ORIGIN'],
      message: 'CORS_ORIGIN must be a comma-separated allowlist of exact origins without paths or wildcards.',
    })
  }
  if (env.NODE_ENV === 'production' && corsOrigins.some((origin) => !origin.startsWith('https://'))) {
    context.addIssue({
      code: 'custom',
      path: ['CORS_ORIGIN'],
      message: 'Every production CORS origin must use HTTPS.',
    })
  }
  if (env.PII_ENCRYPTION_KEY && Buffer.from(env.PII_ENCRYPTION_KEY, 'base64').length !== 32) {
    context.addIssue({
      code: 'custom',
      path: ['PII_ENCRYPTION_KEY'],
      message: 'PII_ENCRYPTION_KEY must be a base64-encoded 32-byte AES-256 key.',
    })
  }
  if (env.NODE_ENV === 'production') {
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      if (!env[key]) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required in production.`,
        })
      }
      if (!env.TWILIO_AUTH_TOKEN || !env.SMS_WEBHOOK_URL) {
        context.addIssue({
          code: 'custom',
          path: ['SMS_WEBHOOK_URL'],
          message: 'TWILIO_AUTH_TOKEN and SMS_WEBHOOK_URL are required to verify inbound SMS webhooks.',
        })
      }
      if (env.DRONE_PROVIDER === 'http' && (!env.DRONE_API_URL || !env.DRONE_API_TOKEN)) {
        context.addIssue({
          code: 'custom',
          path: ['DRONE_API_URL'],
          message: 'DRONE_API_URL and DRONE_API_TOKEN are required for the HTTP drone provider.',
        })
      }
      if (env.SMS_PROVIDER === 'http' && (!env.SMS_API_URL || !env.SMS_API_TOKEN)) {
        context.addIssue({
          code: 'custom',
          path: ['SMS_API_URL'],
          message: 'SMS_API_URL and SMS_API_TOKEN are required for the HTTP SMS provider.',
        })
      }
      if (env.SMS_PROVIDER === 'twilio' && (
        !env.TWILIO_ACCOUNT_SID
        || !env.TWILIO_AUTH_TOKEN
        || !env.TWILIO_FROM_NUMBER
        || !env.SMS_WEBHOOK_URL
      )) {
        context.addIssue({
          code: 'custom',
          path: ['TWILIO_ACCOUNT_SID'],
          message: 'Twilio credentials, a sender number, and SMS_WEBHOOK_URL are required for Twilio SMS.',
        })
      }
      if (!env.SMS_LOG_HASH_SECRET) {
        context.addIssue({
          code: 'custom',
          path: ['SMS_LOG_HASH_SECRET'],
          message: 'SMS_LOG_HASH_SECRET is required in production.',
        })
      }
    }
    if (!env.COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE must be true in production.',
      })
    }
    if (!env.PII_ENCRYPTION_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['PII_ENCRYPTION_KEY'],
        message: 'PII_ENCRYPTION_KEY is required in production.',
      })
    }
    if (!corsOrigins.length) {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGIN'],
        message: 'At least one allowed production origin is required.',
      })
    }
  }
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('; ')
  throw new Error(`Invalid environment configuration: ${details}`)
}

export const env = Object.freeze({
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  corsOrigins: parsed.data.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean),
  piiEncryptionKey: parsed.data.PII_ENCRYPTION_KEY,
  mongoUri: parsed.data.MONGO_URI,
  dbConnectMaxRetries: parsed.data.DB_CONNECT_MAX_RETRIES,
  dbRetryBaseDelayMs: parsed.data.DB_RETRY_BASE_DELAY_MS,
  jwtAccessSecret: parsed.data.JWT_ACCESS_SECRET,
  jwtRefreshSecret: parsed.data.JWT_REFRESH_SECRET,
  accessTokenTtl: parsed.data.ACCESS_TOKEN_TTL,
  refreshTokenTtl: parsed.data.REFRESH_TOKEN_TTL,
  authMaxFailedAttempts: parsed.data.AUTH_MAX_FAILED_ATTEMPTS,
  authLockDurationMinutes: parsed.data.AUTH_LOCK_DURATION_MINUTES,
  authBcryptRounds: parsed.data.AUTH_BCRYPT_ROUNDS,
  authLoginRateLimit: parsed.data.AUTH_LOGIN_RATE_LIMIT,
  authRegisterRateLimit: parsed.data.AUTH_REGISTER_RATE_LIMIT,
  smsWebhookRateLimit: parsed.data.SMS_WEBHOOK_RATE_LIMIT,
  readingRulesetVersion: parsed.data.READING_RULESET_VERSION,
  readingThresholdsJson: parsed.data.READING_THRESHOLDS_JSON,
  alertDedupeWindowMinutes: parsed.data.ALERT_DEDUPE_WINDOW_MINUTES,
  alertEscalationMinutes: parsed.data.ALERT_ESCALATION_MINUTES,
  cookieSecure: parsed.data.COOKIE_SECURE,
  trustProxy: parsed.data.TRUST_PROXY,
  logLevel: parsed.data.LOG_LEVEL,
  sentryDsn: parsed.data.SENTRY_DSN || undefined,
  droneProvider: parsed.data.DRONE_PROVIDER,
  droneApiUrl: parsed.data.DRONE_API_URL,
  droneApiToken: parsed.data.DRONE_API_TOKEN,
  droneCruiseSpeedKmh: parsed.data.DRONE_CRUISE_SPEED_KMH,
  dronePrepMinutes: parsed.data.DRONE_PREP_MINUTES,
  smsProvider: parsed.data.SMS_PROVIDER,
  smsApiUrl: parsed.data.SMS_API_URL,
  smsApiToken: parsed.data.SMS_API_TOKEN,
  twilioAccountSid: parsed.data.TWILIO_ACCOUNT_SID,
  twilioAuthToken: parsed.data.TWILIO_AUTH_TOKEN,
  twilioFromNumber: parsed.data.TWILIO_FROM_NUMBER,
  smsWebhookUrl: parsed.data.SMS_WEBHOOK_URL,
  smsLogHashSecret: parsed.data.SMS_LOG_HASH_SECRET,
  smsInboundRateLimit: parsed.data.SMS_INBOUND_RATE_LIMIT,
  smsInboundRateWindowMinutes: parsed.data.SMS_INBOUND_RATE_WINDOW_MINUTES,
})
