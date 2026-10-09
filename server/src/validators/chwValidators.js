import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i)
const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.array(z.number().finite()).length(2)
    .refine(([longitude]) => longitude >= -180 && longitude <= 180)
    .refine(([, latitude]) => latitude >= -90 && latitude <= 90),
}).strict()
const clientId = z.string().uuid().transform((value) => value.toLowerCase())

export const visitQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  village: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['planned', 'completed', 'missed']).optional(),
}).strict().refine(({ from, to }) => !from || !to || new Date(from) <= new Date(to), {
  path: ['to'],
  message: 'The end date must be on or after the start date.',
})

export const performanceQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).strict().refine(({ from, to }) => !from || !to || new Date(from) < new Date(to), {
  path: ['to'],
  message: 'The end date must be after the start date.',
})

export const createVisitSchema = z.object({
  clientId: clientId.optional(),
  patientId: objectId,
  date: z.coerce.date(),
  status: z.enum(['planned', 'completed', 'missed']).default('completed'),
  checklist: z.array(z.enum(['vitals', 'medications', 'symptoms', 'education'])).max(4).default([]),
  notes: z.string().trim().max(2000).optional(),
  location: pointSchema.optional(),
}).strict()

export const visitParamsSchema = z.object({ visitId: objectId }).strict()
export const updateVisitSchema = z.object({
  status: z.enum(['planned', 'completed', 'missed']).optional(),
  checklist: z.array(z.enum(['vitals', 'medications', 'symptoms', 'education'])).max(4).optional(),
  notes: z.string().trim().max(2000).optional(),
  location: pointSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required.')
