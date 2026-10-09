import { z } from 'zod'

const phoneSchema = z.string()
  .trim()
  .regex(/^(?:\+91)?[6-9]\d{9}$/, 'Enter a valid Indian mobile number.')
  .transform((phone) => phone.replace(/^\+91/, ''))

const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.array(z.number().finite()).length(2)
    .refine(([longitude]) => longitude >= -180 && longitude <= 180)
    .refine(([, latitude]) => latitude >= -90 && latitude <= 90),
}).strict()

export const patientProfileSchema = z.object({
  clientId: z.string().uuid().transform((value) => value.toLowerCase()).optional(),
  name: z.string().trim().min(1).max(120),
  phone: phoneSchema,
  age: z.coerce.number().int().min(0).max(130).optional(),
  gender: z.enum(['female', 'male', 'other', 'prefer_not_to_say']).optional(),
  village: z.string().trim().min(1).max(120),
  mandal: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  location: pointSchema.optional(),
  conditions: z.array(z.enum(['diabetes', 'hypertension', 'cardiac', 'other'])).max(20).optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  allergies: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    notes: z.string().trim().max(500).optional(),
  }).strict()).max(30).optional(),
  emergencyContacts: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    relationship: z.string().trim().max(80).optional(),
    phone: phoneSchema,
    consentToContact: z.boolean().optional(),
  }).strict()).max(10).optional(),
  consent: z.object({
    accepted: z.literal(true),
    policyVersion: z.string().trim().min(1).max(100),
  }).strict(),
}).strict()

export const updatePatientSchema = patientProfileSchema.omit({ consent: true }).partial().refine(
  (input) => Object.keys(input).length > 0,
  'At least one field is required.',
)

export const assignPatientSchema = z.object({
  doctorId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  chwId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
}).strict().refine(
  (input) => Object.hasOwn(input, 'doctorId') || Object.hasOwn(input, 'chwId'),
  'At least one assignment is required.',
)

export const patientListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  q: z.string().trim().max(120).optional(),
  village: z.string().trim().max(120).optional(),
  mandal: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  condition: z.enum(['diabetes', 'hypertension', 'cardiac', 'other']).optional(),
  risk: z.enum(['normal', 'warning', 'critical', 'unclassified']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).strict()
