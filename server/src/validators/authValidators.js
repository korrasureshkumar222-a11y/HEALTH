import { z } from 'zod'

const phoneSchema = z.string()
  .trim()
  .regex(/^(?:\+91)?[6-9]\d{9}$/, 'Enter a valid Indian mobile number.')
  .transform((phone) => phone.replace(/^\+91/, ''))

export const emptyQuerySchema = z.object({}).strict()
export const emptyBodySchema = z.object({}).strict()
export const emptyParamsSchema = z.object({}).strict()

const passwordSchema = z.string()
  .min(12, 'Password must contain at least 12 characters.')
  .max(72, 'Password must not exceed 72 characters.')
  .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'Password is too long.')
  .refine((password) => /[A-Za-z]/.test(password) && /\d/.test(password), 'Password must include letters and numbers.')

const optionalEmailSchema = z.string().trim().email().max(254).optional()

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: phoneSchema,
  email: optionalEmailSchema,
  password: passwordSchema,
  language: z.enum(['en', 'te']).optional(),
  age: z.coerce.number().int().min(0).max(130).optional(),
  gender: z.enum(['female', 'male', 'other', 'prefer_not_to_say']).optional(),
  village: z.string().trim().min(1).max(120),
  mandal: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  consent: z.object({
    accepted: z.literal(true),
    policyVersion: z.string().trim().min(1).max(100),
  }).strict(),
}).strict()

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1).max(72),
}).strict()

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: passwordSchema,
}).strict().refine(
  ({ currentPassword, newPassword }) => currentPassword !== newPassword,
  { path: ['newPassword'], message: 'New password must differ from the current password.' },
)

export const updateLanguageSchema = z.object({
  language: z.enum(['en', 'te']),
}).strict()

const doctorProfileSchema = z.object({
  specialization: z.string().trim().min(1).max(120),
  registrationNo: z.string().trim().min(1).max(100),
  hospital: z.string().trim().max(200).optional(),
}).strict()

const chwProfileSchema = z.object({
  employeeId: z.string().trim().min(1).max(100),
  assignedVillages: z.array(z.object({
    village: z.string().trim().min(1).max(120),
    mandal: z.string().trim().max(120).optional(),
    district: z.string().trim().max(120).optional(),
  }).strict()).default([]),
}).strict()

export const adminCreateUserSchema = z.discriminatedUnion('role', [
  z.object({
    name: z.string().trim().min(1).max(120),
    phone: phoneSchema,
    email: optionalEmailSchema,
    password: passwordSchema,
    role: z.literal('doctor'),
    profile: doctorProfileSchema,
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(120),
    phone: phoneSchema,
    email: optionalEmailSchema,
    password: passwordSchema,
    role: z.literal('chw'),
    profile: chwProfileSchema,
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(120),
    phone: phoneSchema,
    email: optionalEmailSchema,
    password: passwordSchema,
    role: z.literal('admin'),
  }).strict(),
])
