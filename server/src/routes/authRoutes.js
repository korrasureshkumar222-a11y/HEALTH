import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { env } from '../config/env.js'
import {
  createStaffUser,
  getMe,
  loginUser,
  logoutUser,
  refresh,
  register,
  updateLanguage,
  updatePassword,
} from '../controllers/authController.js'
import protect from '../middleware/auth.js'
import authorize from '../middleware/authorize.js'
import requireRefreshCookie from '../middleware/requireRefreshCookie.js'
import validateRequest from '../middleware/validateRequest.js'
import asyncHandler from '../utils/asyncHandler.js'
import {
  adminCreateUserSchema,
  changePasswordSchema,
  emptyBodySchema,
  emptyParamsSchema,
  emptyQuerySchema,
  loginSchema,
  registerSchema,
  updateLanguageSchema,
} from '../validators/authValidators.js'

const router = Router()

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication requests. Please try again later.',
    error: { code: 'RATE_LIMITED' },
  },
})
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.authLoginRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many sign-in attempts. Try again later.', error: { code: 'LOGIN_RATE_LIMITED' } },
})
const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.authRegisterRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many registration attempts. Try again later.', error: { code: 'REGISTER_RATE_LIMITED' } },
})

router.use(authRateLimit)
router.post('/register', registerRateLimit, validateRequest(emptyParamsSchema, 'params'), validateRequest(emptyQuerySchema, 'query'), validateRequest(registerSchema), asyncHandler(register))
router.post('/login', loginRateLimit, validateRequest(emptyParamsSchema, 'params'), validateRequest(emptyQuerySchema, 'query'), validateRequest(loginSchema), asyncHandler(loginUser))
router.post(
  '/refresh',
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(emptyBodySchema),
  requireRefreshCookie,
  asyncHandler(refresh),
)
router.post('/logout', protect, validateRequest(emptyParamsSchema, 'params'), validateRequest(emptyQuerySchema, 'query'), validateRequest(emptyBodySchema), asyncHandler(logoutUser))
router.get('/me', protect, validateRequest(emptyParamsSchema, 'params'), validateRequest(emptyQuerySchema, 'query'), asyncHandler(getMe))
router.patch(
  '/language',
  protect,
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(updateLanguageSchema),
  asyncHandler(updateLanguage),
)
router.post(
  '/change-password',
  protect,
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(changePasswordSchema),
  asyncHandler(updatePassword),
)
router.post(
  '/admin/users',
  protect,
  authorize('admin'),
  validateRequest(emptyParamsSchema, 'params'),
  validateRequest(emptyQuerySchema, 'query'),
  validateRequest(adminCreateUserSchema),
  asyncHandler(createStaffUser),
)

export default router
