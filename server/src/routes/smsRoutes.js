import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { env } from '../config/env.js'
import { postInboundSms } from '../controllers/smsController.js'
import validateRequest from '../middleware/validateRequest.js'
import asyncHandler from '../utils/asyncHandler.js'
import { emptyParamsSchema, emptyQuerySchema, smsInboundSchema } from '../validators/securityValidators.js'

const router = Router()

router.post('/inbound', rateLimit({
  windowMs: 60 * 1000,
  limit: env.smsWebhookRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many SMS webhook requests.', error: { code: 'SMS_RATE_LIMITED' } },
}), validateRequest(emptyParamsSchema, 'params'), validateRequest(emptyQuerySchema, 'query'), validateRequest(smsInboundSchema), asyncHandler(postInboundSms))

export default router
